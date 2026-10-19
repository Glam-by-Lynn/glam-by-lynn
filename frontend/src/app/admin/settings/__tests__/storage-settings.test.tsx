/**
 * The settings page must never present its own initial state as a stored
 * value.
 *
 * The bug these cover: `storageProvider` defaulted to "local", so whenever the
 * real configuration could not be read — most commonly a 403, because the
 * storage endpoint requires super_admin while this page only requires admin —
 * the select rendered "Local Storage" and the admin was told uploads went to
 * the server's disk while Cloudinary was in fact in use.
 */

import { screen, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/utils/test-utils";

import AdminSettingsPage from "../page";

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { accessToken: "test-token" } }),
  useRequireAdmin: () => ({
    user: { email: "admin@example.com" },
    loading: false,
    isAdmin: true,
  }),
}));

/** Minimal stand-ins for the three GETs the page issues on mount. */
function mockApi({
  storageStatus = 200,
  storageBody = {},
}: {
  storageStatus?: number;
  storageBody?: Record<string, unknown>;
} = {}) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/settings/storage")) {
      return Promise.resolve({
        ok: storageStatus >= 200 && storageStatus < 300,
        status: storageStatus,
        json: () => Promise.resolve(storageBody),
      } as Response);
    }

    // Generic settings and Instagram: empty but successful.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as Response);
  }) as jest.Mock;
}

describe("Admin settings — image storage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the provider the API reports, not the default", async () => {
    mockApi({
      storageBody: {
        provider: "cloudinary",
        cloudinary: {
          cloud_name: "bb1zn5mu",
          api_key: "123456789",
          api_secret: "********",
        },
      },
    });

    render(<AdminSettingsPage />);

    // "Cloudinary" appears in the select and the section heading too, so
    // assert on the banner's own text rather than the bare word.
    const banner = await waitFor(() => screen.getByText(/currently in use/i));

    expect(banner).toHaveTextContent("Cloudinary");
    expect(banner).toHaveTextContent("cloud: bb1zn5mu");
    // The stored cloud name is shown as the field's value.
    expect(screen.getByLabelText(/cloud name/i)).toHaveValue("bb1zn5mu");
  });

  it("does not claim local storage when the configuration can't be read", async () => {
    mockApi({ storageStatus: 403, storageBody: { detail: "Super admin access required" } });

    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/only a super admin can view or change storage/i)).toBeInTheDocument();
    });

    // The regression: a provider select rendering "Local Storage" off the back
    // of a failed read. No provider is claimed at all now.
    expect(screen.queryByText(/currently in use/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/local storage/i)).not.toBeInTheDocument();
  });

  it("reports a stored secret instead of putting the mask in the field", async () => {
    mockApi({
      storageBody: {
        provider: "cloudinary",
        cloudinary: {
          cloud_name: "bb1zn5mu",
          api_key: "123456789",
          api_secret: "********",
        },
      },
    });

    render(<AdminSettingsPage />);

    const secret = await screen.findByLabelText(/api secret/i);

    // "********" as a field value invites clearing it, and an empty secret used
    // to be encrypted and saved over the working one.
    expect(secret).toHaveValue("");
    expect(secret).toHaveAttribute("placeholder", expect.stringMatching(/stored/i));
    expect(screen.getByText(/a secret is saved and encrypted/i)).toBeInTheDocument();
  });
});
