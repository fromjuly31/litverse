import { z } from "zod";
import { check, fail, signedImages } from "./server.js";
import { uuid } from "./validation.js";
import { publicDeepeningExhibit } from "./deepening.js";
import {
  alternatePosters,
  findWork,
  groupExhibits,
  matchWorks,
  workSummary,
  WORKS_PER_PAGE,
} from "../../src/utils/exhibition-catalog.js";

async function metadata(query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const batch = check(
      await query()
        .order("id")
        .range(offset, offset + 499),
    );
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

async function availableWorks(db) {
  const [posters, perspectives] = await Promise.all([
    metadata(() =>
      db
        .from("exhibition_posters")
        .select("id,title,author,signature,finalized_at")
        .eq("deletion_pending", false)
        .not("finalized_at", "is", null)
        .not("final_result", "is", null),
    ),
    metadata(() =>
      db.from("deepening_exhibit_index").select("id,title,author,published_at"),
    ),
  ]);
  return groupExhibits(posters, perspectives);
}

export async function readPosterImages(db, rows) {
  const itemIds = (row) => [
    row.final_result.character.image_id,
    row.final_result.scene.image_id,
  ];
  if (!rows.length) return new Map();
  const lessons = rows.filter((row) => !row.character_image_path);
  const uploads = lessons.length
    ? check(
        await db
          .from("image_submissions")
          .select("id,activity_id,image_type,image_path")
          .eq("submission_status", "complete")
          .in("id", lessons.flatMap(itemIds))
          .in(
            "activity_id",
            lessons.map(({ id }) => id),
          ),
      )
    : [];
  const standaloneImages = rows
    .filter((row) => row.character_image_path)
    .flatMap((row) =>
      ["character", "scene"].map((type) => ({
        id: row.final_result[type].image_id,
        activity_id: row.id,
        image_type: type,
        image_path: row[`${type}_image_path`],
      })),
    );
  const photos = new Map(
    (await signedImages(db, [...uploads, ...standaloneImages])).map((photo) => [
      photo.id,
      photo,
    ]),
  );
  return new Map(
    rows.map((row) => [
      row.id,
      itemIds(row)
        .map((id) => photos.get(id))
        .filter((photo) => photo?.activity_id === row.id)
        .map(({ id, image_type, image_url }) => ({
          id,
          image_type,
          image_url,
        })),
    ]),
  );
}

async function readPosters(db, ids) {
  if (!ids.length) return new Map();
  const rows = check(
    await db
      .from("exhibition_posters")
      .select("id,signature,final_result,character_image_path,scene_image_path")
      .eq("deletion_pending", false)
      .not("finalized_at", "is", null)
      .not("final_result", "is", null)
      .in("id", ids),
  );
  const images = await readPosterImages(db, rows);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        signature: row.signature,
        result: row.final_result,
        images: images.get(row.id),
      },
    ]),
  );
}

export async function publicCollection(db, payload) {
  const query = z.string().max(120).default("").parse(payload.query);
  const offset = z
    .number()
    .int()
    .min(0)
    .max(1000000)
    .default(0)
    .parse(payload.offset);
  const works = matchWorks(await availableWorks(db), query);
  if (payload.count_only === true) return { total: works.length };
  const page = works.slice(offset, offset + WORKS_PER_PAGE);
  const ids = page.map((work) => work.posters[0]?.id).filter(Boolean);
  const posters = await readPosters(db, ids);
  return {
    total: works.length,
    items: page.map((work) =>
      workSummary(work, posters.get(work.posters[0]?.id)),
    ),
  };
}

export async function publicWork(db, payload) {
  const ref = z
    .object({
      work_key: z.string().min(1).max(600).optional(),
      poster_id: uuid.optional(),
      session_id: uuid.optional(),
    })
    .parse(payload);
  const work = findWork(await availableWorks(db), ref);
  if (!work) fail(404, "아직 전시 중인 자료가 없는 작품이에요.");
  const posterId = ref.poster_id || work.posters[0]?.id;
  const [posters, rounds] = await Promise.all([
    readPosters(db, posterId ? [posterId] : []),
    work.perspectives.length
      ? check(
          await db
            .from("deepening_exhibit_index")
            .select(
              "id,work_version_id,activity_id,title,author,round,published_at",
            )
            .in(
              "id",
              work.perspectives.map(({ id }) => id),
            ),
        )
      : [],
  ]);
  const sessions = new Map(rounds.map((round) => [round.id, round]));
  const perspectives = await Promise.all(
    work.perspectives
      .filter(({ id }) => sessions.has(id))
      .map(({ id }) => publicDeepeningExhibit(db, sessions.get(id))),
  );
  const poster = posters.get(posterId);
  if (!poster && !perspectives.length)
    fail(404, "아직 전시 중인 자료가 없는 작품이에요.");
  return {
    ...workSummary(work, poster),
    posters: alternatePosters(work),
    perspectives,
  };
}
