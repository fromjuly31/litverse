import { entrance } from "../components/entrance.js";
import {
  logo,
  button,
  icon,
  field,
  formErrors,
  toast,
} from "../components/ui.js";
import { isDemo, signIn } from "../services/api.js";
import { navigate } from "../main.js";
export function landingPage(root) {
  root.innerHTML = entrance(isDemo);
}
export function loginPage(root) {
  root.innerHTML = `<main id="main" class="auth-page"><section class="auth-card">${logo()}<h1>다시, 이야기 속으로.</h1><p>선생님의 문학 수업 공간에 로그인하세요.</p>${isDemo ? `<div class="notice">${icon("info")}<span>현재 데모 모드입니다. 교사 공간을 바로 체험할 수 있어요.</span></div><a class="btn primary" href="/teacher" style="width:100%">데모 교사 공간 열기 ${icon("arrow-right")}</a>` : `<form id="login-form" novalidate>${field("이메일", "email", "", { type: "email", required: true, placeholder: "teacher@school.kr" })}${field("비밀번호", "password", "", { type: "password", required: true })}<p id="login-error" class="step-error" role="alert"></p><button class="btn primary" type="submit">로그인 ${icon("arrow-right")}</button></form>`}<div class="auth-note">관리자가 사전에 등록한 교사 계정만 이용할 수 있습니다.<br/>학생은 선생님이 안내한 QR 코드로 접속해 주세요.</div><div style="text-align:center;margin-top:20px"><a class="text-link" href="/">${icon("arrow-left")} LITVERSE로 돌아가기</a></div></section></main>`;
  const form = root.querySelector("form");
  if (form) {
    form.elements.email.autocomplete = "username";
    form.elements.password.autocomplete = "current-password";
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (formErrors(form)) return;
      const submit = form.querySelector("[type=submit]");
      submit.disabled = true;
      try {
        await signIn(form.elements.email.value, form.elements.password.value);
        await navigate("/teacher");
      } catch (error) {
        root.querySelector("#login-error").textContent = error.message;
        submit.disabled = false;
      }
    };
  }
}
