import React from "react";
import { screen, waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DashboardAuthPanel } from "../src/components/auth/dashboard-auth-panel";
import { LoginForm } from "../src/components/auth/login-form";
import { SocialSigninButtons } from "../src/components/auth/social-signin-buttons";
import * as authApi from "../src/lib/auth-api";
import { render } from "./render";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
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
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    loginWithLocalAccount: vi.fn(),
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
    });
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
    });

    render(React.createElement(SocialSigninButtons));

    const googleButton = await screen.findByRole("link", { name: "Continue with Google" });
    expect(googleButton).toHaveAttribute(
      "href",
      "http://localhost:3001/api/auth/google",
    );

    expect(screen.getByText("Continue with Apple").closest("a")).toHaveAttribute("disabled");
    expect(screen.getByText("Continue with Apple").closest("a")).not.toHaveAttribute("href");
    expect(screen.queryByText("Continue with Facebook")).not.toBeInTheDocument();
  });

  test("local login offers only the configured development accounts", async () => {
    vi.mocked(authApi.getSocialAuthProviders).mockResolvedValue({
      google: false,
      apple: false,
      localAccounts: ["scaichat", "slavisacicovic"],
    });
    vi.mocked(authApi.loginWithLocalAccount).mockResolvedValue({
      user: {
        id: "admin-1",
        email: "scaichat@gmail.com",
        displayName: "sc aiChat",
        role: "admin",
        providers: [],
      },
    });

    const user = userEvent.setup();
    render(React.createElement(LoginForm, {}));

    await user.click(await screen.findByRole("button", { name: "Continue as scaichat (admin)" }));

    expect(authApi.loginWithLocalAccount).toHaveBeenCalledWith("scaichat");
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText("Continue with Google")).not.toBeInTheDocument();
  });
});
