import React from "react";
import { screen, waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DashboardAuthPanel } from "../src/components/auth/dashboard-auth-panel";
import { ForgotPasswordForm } from "../src/components/auth/forgot-password-form";
import { LoginForm } from "../src/components/auth/login-form";
import { RegisterForm } from "../src/components/auth/register-form";
import { ResetPasswordForm } from "../src/components/auth/reset-password-form";
import { SocialSigninButtons } from "../src/components/auth/social-signin-buttons";
import * as authApi from "../src/lib/auth-api";
import { render } from "./render";

const push = vi.fn();
const refresh = vi.fn();
const searchParams = new URLSearchParams("token=reset-token-from-url");

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
  useSearchParams: () => searchParams,
}));

vi.mock("@mui/material", () => {
  type StackProps = React.HTMLAttributes<HTMLElement> & {
    children?: React.ReactNode;
    component?: React.ElementType;
    onSubmit?: React.FormEventHandler<HTMLElement>;
  };
  type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode;
    component?: React.ElementType;
    href?: string;
  };
  type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children?: React.ReactNode;
    component?: React.ElementType;
    href?: string;
  };
  type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
    label: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  };

  function Stack({ component: Component = "div", children, ...props }: StackProps) {
    return React.createElement(Component, props, children);
  }

  function Button({ component: Component, children, type = "button", ...props }: ButtonProps) {
    if (Component) {
      return React.createElement(Component, props, children);
    }

    return React.createElement("button", { type, ...props }, children);
  }

  function Link({ component: Component, children, href, ...props }: LinkProps) {
    if (Component) {
      return React.createElement(Component, { href, ...props }, children);
    }

    return React.createElement("a", { href, ...props }, children);
  }

  function TextField({ label, type = "text", value, onChange, ...props }: TextFieldProps) {
    return React.createElement(
      "label",
      {},
      React.createElement("span", {}, label),
      React.createElement("input", {
        "aria-label": label,
        onChange,
        type,
        value,
        ...props,
      }),
    );
  }

  return {
    Alert: ({ children }: { children?: React.ReactNode }) => React.createElement("div", { role: "alert" }, children),
    Button,
    CircularProgress: ({ size }: { size?: number }) =>
      React.createElement("div", { "aria-label": "loading", "data-size": size, role: "progressbar" }),
    Divider: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
    Link,
    Paper: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
    Stack,
    TextField,
    Typography: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
  };
});

vi.mock("../src/lib/auth-api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/auth-api")>("../src/lib/auth-api");

  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getCurrentUser: vi.fn(),
    getSocialAuthProviders: vi.fn(),
    getSocialAuthStartUrl: vi.fn((provider: string) => `http://localhost:3001/api/auth/${provider}`),
  };
});

describe("web auth components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.getSocialAuthProviders).mockResolvedValue({
      google: false,
      apple: false,
      facebook: false,
    });
  });

  test("login form submits credentials and redirects to dashboard", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: "u1",
        email: "slavisa@example.com",
        displayName: "Slavisa",
        role: "user",
        providers: ["local"],
      },
    });

    const user = userEvent.setup();
    render(React.createElement(LoginForm));

    await user.type(screen.getByLabelText("Email"), "slavisa@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: "slavisa@example.com",
        password: "password123",
      });
    });

    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalled();
  });

  test("register form sends user data and redirects to login", async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      success: true,
      email: "slavisa@example.com",
    });

    const user = userEvent.setup();
    render(React.createElement(RegisterForm));

    await user.type(screen.getByLabelText("Display name"), "Slavisa");
    await user.type(screen.getByLabelText("Email"), "slavisa@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        displayName: "Slavisa",
        email: "slavisa@example.com",
        password: "password123",
      });
    });

    expect(push).toHaveBeenCalledWith("/login?verification=check-email");
  });

  test("forgot password form shows generic success message after server call", async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ success: true });

    const user = userEvent.setup();
    render(React.createElement(ForgotPasswordForm));

    await user.type(screen.getByLabelText("Email"), "slavisa@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith({
        email: "slavisa@example.com",
      });
    });

    expect(screen.getByText("If that email exists, Trailbook has sent a reset link.")).toBeInTheDocument();
  });

  test("reset password form reads token from URL and redirects to login", async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue({ success: true });

    const user = userEvent.setup();
    render(React.createElement(ResetPasswordForm));

    expect(screen.getByLabelText("Reset token")).toHaveValue("reset-token-from-url");

    await user.type(screen.getByLabelText("New password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm new password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(authApi.resetPassword).toHaveBeenCalledWith({
        token: "reset-token-from-url",
        password: "newpassword123",
      });
    });

    expect(push).toHaveBeenCalledWith("/login?reset=1");
  });

  test("dashboard auth panel loads current user and can logout", async () => {
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      user: {
        id: "u1",
        email: "slavisa@example.com",
        displayName: "Slavisa",
        role: "user",
        providers: ["local"],
      },
    });
    vi.mocked(authApi.logout).mockResolvedValue({ success: true });

    const user = userEvent.setup();
    render(React.createElement(DashboardAuthPanel));

    expect(await screen.findByText("Welcome back, Slavisa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled();
    });

    expect(push).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalled();
  });

  test("social auth buttons are enabled only for configured providers", async () => {
    vi.mocked(authApi.getSocialAuthProviders).mockResolvedValue({
      google: true,
      apple: false,
      facebook: false,
    });

    render(React.createElement(SocialSigninButtons));

    const googleButton = await screen.findByRole("link", { name: "Continue with Google" });
    expect(googleButton).toHaveAttribute(
      "href",
      "http://localhost:3001/api/auth/google",
    );

    expect(screen.getByText("Continue with Apple").closest("a")).toHaveAttribute("disabled");
    expect(screen.getByText("Continue with Apple").closest("a")).not.toHaveAttribute("href");
    expect(screen.getByText("Continue with Facebook").closest("a")).toHaveAttribute("disabled");
    expect(screen.getByText("Continue with Facebook").closest("a")).not.toHaveAttribute("href");
  });
});
