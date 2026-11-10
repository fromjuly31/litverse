import { speechSegments } from "../utils/text-study.js";

export function createNarrator({
  onState,
  onBoundary,
  onFinished,
  onError,
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
}) {
  let generation = 0,
    status = "idle",
    current,
    segments = [],
    index = 0,
    preferences;
  const setState = (state) => {
    status = state;
    onState?.(state);
  };
  const stop = () => {
    generation++;
    current = null;
    synth?.cancel();
    setState("idle");
  };
  const speakSegment = (token) => {
    if (token !== generation) return;
    if (index >= segments.length) {
      setState("idle");
      current = null;
      onFinished?.();
      return;
    }
    const segment = segments[index];
    const utterance = new Utterance(segment.text);
    current = utterance;
    utterance.lang = preferences.voice?.lang || "ko-KR";
    if (preferences.voice) utterance.voice = preferences.voice;
    utterance.rate = preferences.rate;
    utterance.pitch = preferences.pitch;
    utterance.onstart = () => {
      if (token === generation) {
        setState("speaking");
        onBoundary?.(segment.offset, segment.text.length);
      }
    };
    utterance.onboundary = (event) => {
      if (token === generation)
        onBoundary?.(segment.offset + event.charIndex, event.charLength || 1);
    };
    utterance.onend = () => {
      if (token === generation) {
        index++;
        speakSegment(token);
      }
    };
    utterance.onerror = (event) => {
      if (token !== generation) return;
      generation++;
      current = null;
      setState("idle");
      if (!["canceled", "interrupted"].includes(event.error))
        onError?.(
          "낭독을 재생하지 못했어요. 다른 목소리를 선택하거나 다시 재생해 주세요.",
        );
    };
    synth.speak(utterance);
  };
  return {
    supported: !!(synth && Utterance),
    get status() {
      return status;
    },
    start(text, options = {}) {
      stop();
      if (!synth || !Utterance) {
        onError?.(
          "이 브라우저에서는 낭독을 지원하지 않아요. Chrome 또는 Edge에서 열어 주세요.",
        );
        return;
      }
      segments = speechSegments(text);
      index = 0;
      preferences = {
        voice: options.voice,
        rate: options.rate || 1,
        pitch: options.pitch || 1,
      };
      synth.resume();
      setState("speaking");
      speakSegment(generation);
    },
    pause() {
      if (status === "speaking") {
        synth.pause();
        setState("paused");
      }
    },
    resume() {
      if (status === "paused") {
        synth.resume();
        setState("speaking");
      }
    },
    stop,
  };
}
