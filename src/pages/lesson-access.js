import { museumHeader, museumFooter } from "../components/museum-shell.js";
import {
  icon,
  field,
  formErrors,
  toast,
  confirmDialog,
  openModal,
  button,
} from "../components/ui.js";
import { request, isDemo, signIn, signOut } from "../services/api.js";
import { rememberAccess } from "../services/access.js";
import { e } from "../utils/helpers.js";
import { navigate, render } from "../main.js";

export async function unlockPage(root, id, next) {
  const a = (await request("public/list")).find((a) => a.id === id);
  if (!a) throw new Error("수업을 찾을 수 없어요.");
  const setup = a.needs_password_setup;
  root.innerHTML = `${museumHeader()}<main id="main" class="lesson-lock"><section class="lock-card"><span class="eyebrow">A KEY TO YOUR CLASSROOM</span><h1>${e(a.title)}</h1><p>${e(a.author)} · ${e(a.class_name || "문학 수업")}</p><div class="lock-symbol">${icon("lock-keyhole")}</div><h2>${setup ? "이 수업의 비밀번호를 설정해 주세요." : "우리 수업의 문을 다시 열어요."}</h2><p>${setup ? "이전 데모 수업에 처음 한 번 비밀번호를 정합니다. 다음부터 이 비밀번호로 이어갈 수 있어요." : "수업을 만들 때 설정한 비밀번호를 입력해 주세요."}</p><form id="unlock-form" novalidate>${field("수업 비밀번호", "password", "", { type: "password", required: true, max: 128, hint: "8자 이상 · 비밀번호는 공개되지 않습니다." })}${setup ? field("비밀번호 확인", "confirm_password", "", { type: "password", required: true, max: 128 }) : ""}<p class="step-error" role="alert"></p><button class="btn primary" type="submit">${icon("arrow-right")} ${setup ? "비밀번호 설정하고 시작" : "수업 열기"}</button></form><a class="text-link" href="/teacher">${icon("arrow-left")} 수업 목록으로</a></section></main>${museumFooter()}`;
  const form = root.querySelector("form");
  form.elements.password.autocomplete = setup
    ? "new-password"
    : "current-password";
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (formErrors(form)) return;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      if (
        setup &&
        form.elements.password.value !== form.elements.confirm_password.value
      )
        throw new Error("비밀번호 확인이 일치하지 않아요.");
      const access = await request("lesson/unlock", {
        id,
        password: form.elements.password.value,
        set_password: !!setup,
      });
      rememberAccess(id, access);
      await navigate(next, true);
    } catch (error) {
      form.querySelector(".step-error").textContent = error.message;
      btn.disabled = false;
    }
  };
}

export async function adminPage(root) {
  const session = await request("admin/session");
  if (!session.authenticated) {
    const setup = isDemo && !session.configured;
    root.innerHTML = `${museumHeader()}<main id="main" class="lesson-lock"><section class="lock-card"><span class="eyebrow">MUSEUM ADMINISTRATION</span><h1>${setup ? "전시관 관리자 설정" : "관리자 로그인"}</h1><p>${isDemo ? "이 브라우저의 수업과 전시작을 관리합니다." : "관리자로 등록된 계정으로 로그인해 주세요."}</p><form id="admin-form" novalidate>${!isDemo ? field("이메일", "email", "", { type: "email", required: true }) : ""}${field("관리자 비밀번호", "password", "", { type: "password", required: true, max: 128, hint: setup ? "8자 이상으로 직접 정해 주세요. 수업 비밀번호와 별도로 보관합니다." : "" })}${setup ? field("관리자 비밀번호 확인", "confirm_password", "", { type: "password", required: true, max: 128 }) : ""}<p class="step-error" role="alert"></p><button class="btn primary" type="submit">${setup ? "관리자 설정" : "로그인"}</button></form><a class="text-link" href="/">전시관으로 돌아가기</a></section></main>${museumFooter()}`;
    const form = root.querySelector("form");
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (formErrors(form)) return;
      const btn = form.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        if (
          setup &&
          form.elements.password.value !== form.elements.confirm_password.value
        )
          throw new Error("비밀번호 확인이 일치하지 않아요.");
        if (isDemo)
          rememberAccess(
            "admin",
            await request(setup ? "admin/setup" : "admin/login", {
              password: form.elements.password.value,
            }),
          );
        else {
          await signIn(form.elements.email.value, form.elements.password.value);
          if (!(await request("admin/session")).authenticated) {
            await signOut();
            throw new Error("관리자 권한이 없는 계정입니다.");
          }
        }
        await navigate("/admin", true);
      } catch (error) {
        form.querySelector(".step-error").textContent = error.message;
        btn.disabled = false;
      }
    };
    return;
  }
  const lessons = await request("public/list");
  root.innerHTML = `${museumHeader()}<main id="main" class="admin-page"><div class="page-heading"><div><span class="eyebrow">ADMINISTRATOR</span><h1>전시관 관리</h1><p>수업 비밀번호 없이 모든 수업을 열고, 수정하고, 삭제할 수 있습니다.</p></div><button class="btn secondary" id="admin-logout">로그아웃</button></div><div class="admin-list">${lessons.map((a) => `<article class="admin-row" data-id="${e(a.id)}"><div><h2>${e(a.title)}</h2><p>${e(a.author)} · ${a.finalized_at ? "전시 완료" : "수업 진행 중"}</p></div><div><a class="btn secondary" href="/teacher/activity/${e(a.id)}/background">열기 · 수정</a>${button("암호 재설정", "lock-keyhole", "secondary", "data-reset-password")}${button("삭제", "trash-2", "danger", "data-delete-lesson")}</div></article>`).join("") || '<div class="empty">등록된 수업이 없습니다.</div>'}</div><a class="text-link" href="/teacher/settings">저장소 정리 및 운영 설정 ${icon("arrow-up-right")}</a></main>${museumFooter()}`;
  root.querySelector("#admin-logout").onclick = async () => {
    await signOut();
    await navigate("/");
  };
  root.querySelector(".admin-list").onclick = (ev) => {
    const row = ev.target.closest("[data-id]");
    if (!row) return;
    const a = lessons.find((a) => a.id === row.dataset.id);
    if (ev.target.closest("[data-delete-lesson]"))
      confirmDialog({
        title: "수업과 전시작을 삭제할까요?",
        message: `「${a.title}」의 분석, 사진, 완성 포스터를 모두 삭제합니다. 되돌릴 수 없습니다.`,
        typed: a.title,
        confirm: "수업 전체 삭제",
        danger: true,
        onConfirm: async () => {
          await request("teacher/delete-activity", { id: a.id });
          await render();
        },
      });
    if (ev.target.closest("[data-reset-password]")) {
      const modal = openModal({
        title: "수업 비밀번호 재설정",
        body: `${field("새 수업 비밀번호", "password", "", { type: "password", required: true, max: 128 })}<p class="step-error" role="alert"></p>`,
        footer: button(
          "새 비밀번호 저장",
          "check",
          "primary",
          'id="save-password"',
        ),
      });
      modal.element.querySelector("#save-password").onclick = async (event) => {
        event.currentTarget.disabled = true;
        try {
          await request("admin/password", {
            id: a.id,
            password: modal.element.querySelector("[name=password]").value,
          });
          modal.close();
          toast("비밀번호를 변경하고 기존 수업 접속을 만료시켰어요.");
        } catch (error) {
          modal.element.querySelector(".step-error").textContent =
            error.message;
          modal.element.querySelector("#save-password").disabled = false;
        }
      };
    }
  };
}
