export const LESSON_PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordLengthError(
  password,
  minimum = LESSON_PASSWORD_MIN_LENGTH,
) {
  return typeof password !== "string" ||
    password.length < minimum ||
    password.length > PASSWORD_MAX_LENGTH
    ? `비밀번호는 ${minimum}~${PASSWORD_MAX_LENGTH}자로 입력해 주세요.`
    : "";
}
