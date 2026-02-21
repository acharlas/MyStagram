import React from "react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("../../app/(public)/login/_components/login-form", () => ({
  LoginForm: () => null,
}));

vi.mock("../../app/(public)/register/_components/register-form", () => ({
  RegisterForm: () => null,
}));

import LoginPage from "../../app/(public)/login/page";
import RegisterPage from "../../app/(public)/register/page";

describe("public auth pages", () => {
  const previousReactGlobal = (
    globalThis as unknown as { React?: typeof React }
  ).React;

  beforeAll(() => {
    (globalThis as unknown as { React: typeof React }).React = React;
  });

  afterAll(() => {
    const globals = globalThis as unknown as { React?: typeof React };
    if (previousReactGlobal) {
      globals.React = previousReactGlobal;
      return;
    }
    delete globals.React;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login page stays accessible without redirect", async () => {
    await LoginPage();

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("register page stays accessible without redirect", async () => {
    await RegisterPage();

    expect(redirectMock).not.toHaveBeenCalled();
  });
});
