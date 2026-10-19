/**
 * Admin Settings Page
 * Configure site-wide settings, business info, and admin users
 */

"use client";

import { useState, useEffect } from "react";
import { useRequireAdmin } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  ToggleLeft,
  Loader2,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Instagram,
  RefreshCw,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { extractErrorMessage } from "@/lib/error-utils";
import { API_BASE_URL, API_ENDPOINTS } from "@/config/api";
import { useAuth } from "@/hooks/useAuth";

/**
 * What the API returns in place of a stored secret, and what it accepts back
 * to mean "unchanged". Must match MASKED in
 * backend/app/api/routes/admin/storage_settings.py.
 */
const MASKED_SECRET = "********";

const STORAGE_PROVIDER_LABELS: Record<string, string> = {
  local: "Local Storage",
  s3: "Amazon S3",
  cloudinary: "Cloudinary",
};

export default function AdminSettingsPage() {
  const { user, loading: authLoading, isAdmin } = useRequireAdmin();
  const { session } = useAuth();

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  // Set when the saved settings could not be read at all, so the page can say
  // "unknown" rather than present its initial state as the stored values.
  const [settingsLoadError, setSettingsLoadError] = useState("");

  // Feature Toggles (persisted via API)
  const [featureToggles, setFeatureToggles] = useState({
    enable_newsletter: false,
  });

  // WhatsApp ordering (persisted via API as site setting)
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSuccess, setWhatsappSuccess] = useState("");
  const [whatsappError, setWhatsappError] = useState("");

  // Social Media
  const [socialMedia, setSocialMedia] = useState({
    facebook: "",
    instagram: "",
    twitter: "",
    tiktok: "",
    youtube: "",
  });

  // Payment Settings (shown to customers on the order confirmation page)
  const [paymentSettings, setPaymentSettings] = useState({
    mpesaPaybill: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
    confirmationPhone: "",
    confirmationEmail: "",
    contactPhone: "",
    contactEmail: "",
  });

  // Image Storage Settings
  //
  // `storageProvider` starts as null, not "local". It used to default to
  // "local", which meant any failure to read the real configuration left the
  // page confidently displaying "Local Storage" while Cloudinary was the
  // provider actually in use — the select showed a default as though it were
  // the stored value. Null renders nothing until we know, and
  // `storageLoadError` explains why if we never find out.
  type StorageProvider = "local" | "s3" | "cloudinary";
  const [storageProvider, setStorageProvider] = useState<StorageProvider | null>(null);
  // The provider in effect on the server, kept separate from the select so the
  // admin can always see what is live even after changing the dropdown.
  const [activeStorage, setActiveStorage] = useState<{
    provider: StorageProvider;
    detail: string;
  } | null>(null);
  const [storageLoadError, setStorageLoadError] = useState("");
  const [s3Config, setS3Config] = useState({
    bucket_name: "",
    access_key_id: "",
    region: "us-east-1",
  });
  const [cloudinaryConfig, setCloudinaryConfig] = useState({
    cloud_name: "",
    api_key: "",
  });
  // Secrets are never read back — the API masks them. These track whether one
  // is already stored, so the input can say so instead of showing "********"
  // as if it were the value. Typed secrets live in their own state and are
  // sent only when non-empty.
  const [s3SecretStored, setS3SecretStored] = useState(false);
  const [cloudinarySecretStored, setCloudinarySecretStored] = useState(false);
  const [s3SecretInput, setS3SecretInput] = useState("");
  const [cloudinarySecretInput, setCloudinarySecretInput] = useState("");
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageTesting, setStorageTesting] = useState(false);
  const [storageTestResult, setStorageTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [storageSuccess, setStorageSuccess] = useState("");
  const [storageError, setStorageError] = useState("");

  // Instagram Integration
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [instagramUserId, setInstagramUserId] = useState("");
  const [instagramAccessToken, setInstagramAccessToken] = useState("");
  const [instagramTokenSet, setInstagramTokenSet] = useState(false);
  const [instagramLastSync, setInstagramLastSync] = useState<string | null>(null);
  const [instagramTokenExpires, setInstagramTokenExpires] = useState<string | null>(null);
  const [instagramSaving, setInstagramSaving] = useState(false);
  const [instagramSyncing, setInstagramSyncing] = useState(false);
  const [instagramSuccess, setInstagramSuccess] = useState("");
  const [instagramError, setInstagramError] = useState("");

  // Fetch saved settings from API on mount.
  //
  // Every field below shows a stored value, so a failed load has to say so.
  // Silently leaving the initial state in place is what made this page claim
  // storage was local when it was Cloudinary: an unset field and a field we
  // failed to read look identical to the admin, and one of them invites
  // re-entering a value that was already saved.
  useEffect(() => {
    async function loadSettings() {
      try {
        const token = (session as any)?.accessToken;
        if (!token) {
          setSettingsLoadError(
            "Your session has no API token, so saved settings could not be loaded. Sign out and back in."
          );
          setStorageLoadError(
            "Could not read the storage configuration, so the provider in use is unknown."
          );
          return;
        }
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.ADMIN_LIST}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setSettingsLoadError(
            `Could not load saved settings (HTTP ${response.status}). The fields below may not reflect what is stored.`
          );
        }
        if (response.ok) {
          const data = await response.json();
          setFeatureToggles((prev) => ({
            ...prev,
            enable_newsletter: data.enable_newsletter ?? false,
          }));
          setSocialMedia((prev) => ({
            ...prev,
            facebook: data.social_facebook ?? "",
            instagram: data.social_instagram ?? "",
            twitter: data.social_twitter ?? "",
            tiktok: data.social_tiktok ?? "",
            youtube: data.social_youtube ?? "",
          }));
          setWhatsappPhone(data.whatsapp_phone_number ?? "");
          setPaymentSettings((prev) => ({
            ...prev,
            mpesaPaybill: data.payment_mpesa_paybill ?? "",
            bankName: data.payment_bank_name ?? "",
            bankAccountName: data.payment_bank_account_name ?? "",
            bankAccountNumber: data.payment_bank_account_number ?? "",
            confirmationPhone: data.payment_confirmation_phone ?? "",
            confirmationEmail: data.payment_confirmation_email ?? "",
            contactPhone: data.contact_phone ?? "",
            contactEmail: data.contact_email ?? "",
          }));
        }

        // Load Instagram settings
        const igRes = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.INSTAGRAM_GET}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (igRes.ok) {
          const igData = await igRes.json();
          setInstagramEnabled(igData.enabled ?? false);
          setInstagramUserId(igData.user_id ?? "");
          setInstagramTokenSet(igData.access_token_set ?? false);
          setInstagramLastSync(igData.last_sync ?? null);
          setInstagramTokenExpires(igData.token_expires_at ?? null);
        }

        // Load storage settings.
        //
        // This endpoint requires super_admin while the page only requires
        // admin, so a 403 here is an ordinary outcome rather than a bug — and
        // it must not be mistaken for "storage is local".
        const storageRes = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.STORAGE_GET}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (storageRes.ok) {
          const storageData = await storageRes.json();
          const provider: StorageProvider = storageData.provider || "local";
          setStorageProvider(provider);

          if (storageData.s3) {
            setS3Config({
              bucket_name: storageData.s3.bucket_name || "",
              access_key_id: storageData.s3.access_key_id || "",
              region: storageData.s3.region || "us-east-1",
            });
            // The response masks the secret as "********"; its presence means
            // one is stored, and it is never a value to put in the field.
            setS3SecretStored(Boolean(storageData.s3.secret_access_key));
          }
          if (storageData.cloudinary) {
            setCloudinaryConfig({
              cloud_name: storageData.cloudinary.cloud_name || "",
              api_key: storageData.cloudinary.api_key || "",
            });
            setCloudinarySecretStored(Boolean(storageData.cloudinary.api_secret));
          }

          setActiveStorage({
            provider,
            detail:
              provider === "cloudinary"
                ? storageData.cloudinary?.cloud_name
                  ? `cloud: ${storageData.cloudinary.cloud_name}`
                  : "no credentials stored"
                : provider === "s3"
                  ? storageData.s3?.bucket_name
                    ? `bucket: ${storageData.s3.bucket_name}`
                    : "no credentials stored"
                  : "uploads are written to the server's own disk",
          });
        } else if (storageRes.status === 403) {
          setStorageLoadError(
            "Only a super admin can view or change storage settings, so the current configuration can't be shown here."
          );
        } else {
          setStorageLoadError(
            `Could not read the storage configuration (HTTP ${storageRes.status}), so the provider in use is unknown — reload to try again.`
          );
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        setSettingsLoadError(extractErrorMessage(err, "Could not reach the API to load settings"));
        setStorageLoadError(
          "Could not read the storage configuration, so the provider in use is unknown."
        );
      } finally {
        setSettingsLoading(false);
      }
    }
    if (!authLoading && isAdmin) {
      loadSettings();
    }
  }, [authLoading, isAdmin, session]);

  const handleSaveFeatureToggles = async () => {
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const token = (session as any)?.accessToken;
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.ADMIN_UPDATE}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(featureToggles),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setSaveSuccess("Feature toggles saved successfully");
      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error saving feature toggles:", err);
      setSaveError(extractErrorMessage(err, "Failed to save feature toggles"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWhatsapp = async () => {
    setWhatsappSaving(true);
    setWhatsappError("");
    setWhatsappSuccess("");

    const digits = whatsappPhone.replace(/\D/g, "");
    if (digits && (digits.length < 8 || digits.length > 15)) {
      setWhatsappError("Enter a valid phone number with country code (8–15 digits, no '+').");
      setWhatsappSaving(false);
      return;
    }

    try {
      const token = (session as any)?.accessToken;
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.ADMIN_UPDATE}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ whatsapp_phone_number: digits }),
      });
      if (!response.ok) throw new Error("Failed to save WhatsApp number");
      setWhatsappPhone(digits);
      setWhatsappSuccess("WhatsApp number saved");
      setTimeout(() => setWhatsappSuccess(""), 3000);
    } catch (err: any) {
      setWhatsappError(extractErrorMessage(err, "Failed to save WhatsApp number"));
    } finally {
      setWhatsappSaving(false);
    }
  };

  const handleSaveSocialMedia = async () => {
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const token = (session as any)?.accessToken;
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.ADMIN_UPDATE}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          social_facebook: socialMedia.facebook,
          social_instagram: socialMedia.instagram,
          social_twitter: socialMedia.twitter,
          social_tiktok: socialMedia.tiktok,
          social_youtube: socialMedia.youtube,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save social media links");
      }

      setSaveSuccess("Social media links saved successfully");
      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error saving social media:", err);
      setSaveError(extractErrorMessage(err, "Failed to save social media links"));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePaymentSettings = async () => {
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const token = (session as any)?.accessToken;
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.ADMIN_UPDATE}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payment_mpesa_paybill: paymentSettings.mpesaPaybill.trim(),
          payment_bank_name: paymentSettings.bankName.trim(),
          payment_bank_account_name: paymentSettings.bankAccountName.trim(),
          payment_bank_account_number: paymentSettings.bankAccountNumber.trim(),
          payment_confirmation_phone: paymentSettings.confirmationPhone.trim(),
          payment_confirmation_email: paymentSettings.confirmationEmail.trim(),
          contact_phone: paymentSettings.contactPhone.trim(),
          contact_email: paymentSettings.contactEmail.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save payment settings");
      }

      setSaveSuccess("Payment settings saved successfully");
      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error saving payment settings:", err);
      setSaveError(extractErrorMessage(err, "Failed to save payment settings"));
    } finally {
      setSaving(false);
    }
  };

  /**
   * The request body for the storage test and save endpoints.
   *
   * The API masks stored secrets as "********" on read and treats that exact
   * string on write as "leave the stored secret alone". So an untouched secret
   * field must send the sentinel, never an empty string — sending "" would
   * encrypt an empty secret and break uploads. Returns null when a secret is
   * needed and neither stored nor typed.
   */
  const buildStorageBody = (): Record<string, unknown> | null => {
    const body: Record<string, unknown> = { provider: storageProvider };

    if (storageProvider === "s3") {
      if (!s3SecretInput && !s3SecretStored) {
        setStorageError("Enter the S3 secret access key before saving or testing.");
        return null;
      }
      body.s3 = { ...s3Config, secret_access_key: s3SecretInput || MASKED_SECRET };
    }

    if (storageProvider === "cloudinary") {
      if (!cloudinarySecretInput && !cloudinarySecretStored) {
        setStorageError("Enter the Cloudinary API secret before saving or testing.");
        return null;
      }
      body.cloudinary = {
        ...cloudinaryConfig,
        api_secret: cloudinarySecretInput || MASKED_SECRET,
      };
    }

    return body;
  };

  const handleTestStorageConnection = async () => {
    setStorageTesting(true);
    setStorageTestResult(null);
    setStorageError("");

    try {
      const token = (session as any)?.accessToken;
      const body = buildStorageBody();
      if (!body) return;

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.STORAGE_TEST}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Test request failed");
      const result = await response.json();
      setStorageTestResult(result);
    } catch (err: any) {
      setStorageTestResult({
        success: false,
        message: extractErrorMessage(err, "Connection test failed"),
      });
    } finally {
      setStorageTesting(false);
    }
  };

  const handleSaveStorageSettings = async () => {
    setStorageSaving(true);
    setStorageError("");
    setStorageSuccess("");
    setStorageTestResult(null);

    try {
      const token = (session as any)?.accessToken;
      const body = buildStorageBody();
      if (!body) return;

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.STORAGE_UPDATE}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Failed to save storage settings");

      // The endpoint echoes back the stored configuration, so adopt it rather
      // than assuming the save produced what was typed — this is what keeps
      // "Currently in use" honest immediately after a change.
      const saved = await response.json();
      const savedProvider: StorageProvider = saved.provider || "local";
      setStorageProvider(savedProvider);
      setS3SecretStored(Boolean(saved.s3?.secret_access_key));
      setCloudinarySecretStored(Boolean(saved.cloudinary?.api_secret));
      setS3SecretInput("");
      setCloudinarySecretInput("");
      setStorageLoadError("");
      setActiveStorage({
        provider: savedProvider,
        detail:
          savedProvider === "cloudinary"
            ? `cloud: ${saved.cloudinary?.cloud_name || "unknown"}`
            : savedProvider === "s3"
              ? `bucket: ${saved.s3?.bucket_name || "unknown"}`
              : "uploads are written to the server's own disk",
      });

      setStorageSuccess("Storage settings saved successfully");
      setTimeout(() => setStorageSuccess(""), 3000);
    } catch (err: any) {
      setStorageError(extractErrorMessage(err, "Failed to save storage settings"));
    } finally {
      setStorageSaving(false);
    }
  };

  const handleSaveInstagramSettings = async () => {
    setInstagramSaving(true);
    setInstagramError("");
    setInstagramSuccess("");

    try {
      const token = (session as any)?.accessToken;
      const body: any = { enabled: instagramEnabled };
      if (instagramUserId) body.user_id = instagramUserId;
      if (instagramAccessToken) body.access_token = instagramAccessToken;

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.INSTAGRAM_UPDATE}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Failed to save Instagram settings");

      const data = await response.json();
      setInstagramTokenSet(data.access_token_set);
      setInstagramAccessToken(""); // Clear the input after save
      setInstagramSuccess("Instagram settings saved successfully");
      setTimeout(() => setInstagramSuccess(""), 3000);
    } catch (err: any) {
      setInstagramError(extractErrorMessage(err, "Failed to save Instagram settings"));
    } finally {
      setInstagramSaving(false);
    }
  };

  const handleInstagramSync = async () => {
    setInstagramSyncing(true);
    setInstagramError("");
    setInstagramSuccess("");

    try {
      const token = (session as any)?.accessToken;
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SETTINGS.INSTAGRAM_SYNC}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Sync failed");

      const data = await response.json();
      setInstagramLastSync(new Date().toISOString());
      setInstagramSuccess(data.message);
      setTimeout(() => setInstagramSuccess(""), 5000);
    } catch (err: any) {
      setInstagramError(extractErrorMessage(err, "Instagram sync failed"));
    } finally {
      setInstagramSyncing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your site configuration and business settings
        </p>
      </div>

      {/* Success/Error Messages */}
      {saveSuccess && (
        <div className="rounded border-l-4 border-green-500 bg-green-50 p-4 text-green-700">
          {saveSuccess}
        </div>
      )}
      {saveError && (
        <div className="rounded border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {saveError}
        </div>
      )}

      {/* A failed load has to be visible. Without this the page falls back to
          its initial state and every field reads as a deliberate setting. */}
      {!settingsLoading && settingsLoadError && (
        <div className="flex items-start gap-2 rounded border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{settingsLoadError}</span>
        </div>
      )}

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Feature Toggles Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ToggleLeft className="h-5 w-5" />
              Feature Toggles
            </CardTitle>
            <CardDescription>Enable or disable site features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">Newsletter Subscription</div>
                    <div className="text-muted-foreground text-sm">
                      Show newsletter signup on the homepage and footer
                    </div>
                  </div>
                  <Switch
                    checked={featureToggles.enable_newsletter}
                    onCheckedChange={(checked) =>
                      setFeatureToggles({
                        ...featureToggles,
                        enable_newsletter: checked,
                      })
                    }
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveFeatureToggles} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* WhatsApp Ordering Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              WhatsApp Ordering
            </CardTitle>
            <CardDescription>
              Phone number used for the “Order/Book on WhatsApp” buttons. Stored server-side and
              never exposed in the public site bundle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {whatsappSuccess && (
              <div className="rounded border-l-4 border-green-500 bg-green-50 p-3 text-sm text-green-700">
                {whatsappSuccess}
              </div>
            )}
            {whatsappError && (
              <div className="rounded border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-700">
                {whatsappError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="whatsapp-phone">WhatsApp Phone Number</Label>
              <Input
                id="whatsapp-phone"
                inputMode="numeric"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="254712345678"
              />
              <p className="text-muted-foreground text-xs">
                Digits only, including country code, no leading “+”. Example:
                <code className="bg-muted ml-1 rounded px-1 py-0.5">254712345678</code>. Leave empty
                to disable WhatsApp ordering.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveWhatsapp} disabled={whatsappSaving}>
                <Save className="mr-2 h-4 w-4" />
                {whatsappSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Image Storage Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Image Storage
            </CardTitle>
            <CardDescription>Configure where uploaded images are stored</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                {/* Success / Error */}
                {storageSuccess && (
                  <div className="rounded border-l-4 border-green-500 bg-green-50 p-3 text-sm text-green-700">
                    {storageSuccess}
                  </div>
                )}
                {storageError && (
                  <div className="rounded border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-700">
                    {storageError}
                  </div>
                )}

                {/* What is actually in use on the server. Shown separately
                    from the select so changing the dropdown never changes
                    what this reports. */}
                {activeStorage && (
                  <div className="bg-muted/50 flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <HardDrive className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      Currently in use:{" "}
                      <span className="font-medium">
                        {STORAGE_PROVIDER_LABELS[activeStorage.provider]}
                      </span>
                      <span className="text-muted-foreground"> — {activeStorage.detail}</span>
                    </span>
                  </div>
                )}
              </>
            )}

            {/* The configuration could not be read. Deliberately renders no
                provider select: showing one would mean showing a value we do
                not have, which is the bug this replaced. */}
            {!settingsLoading && storageLoadError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{storageLoadError}</span>
              </div>
            )}

            {!settingsLoading && !storageLoadError && storageProvider && (
              <>
                {/* Provider Select */}
                <div className="space-y-2">
                  <Label>Storage Provider</Label>
                  <Select
                    value={storageProvider}
                    onValueChange={(value: StorageProvider) => {
                      setStorageProvider(value);
                      setStorageTestResult(null);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Not labelled "(default)" any more: when the real
                          provider failed to load, that word read as a
                          statement about this site's configuration. */}
                      <SelectItem value="local">Local Storage (server disk)</SelectItem>
                      <SelectItem value="s3">Amazon S3</SelectItem>
                      <SelectItem value="cloudinary">Cloudinary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Warning Banner */}
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    Switching providers does not migrate existing images. Old image URLs will
                    continue to work as long as the files remain at their original location.
                  </span>
                </div>

                {/* S3 Config */}
                {storageProvider === "s3" && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <h4 className="text-sm font-medium">Amazon S3 Configuration</h4>
                    <div className="space-y-2">
                      <Label htmlFor="s3-bucket">Bucket Name</Label>
                      <Input
                        id="s3-bucket"
                        value={s3Config.bucket_name}
                        onChange={(e) => setS3Config({ ...s3Config, bucket_name: e.target.value })}
                        placeholder="my-bucket"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3-access-key">Access Key ID</Label>
                      <Input
                        id="s3-access-key"
                        value={s3Config.access_key_id}
                        onChange={(e) =>
                          setS3Config({ ...s3Config, access_key_id: e.target.value })
                        }
                        placeholder="AKIA..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3-secret">Secret Access Key</Label>
                      <Input
                        id="s3-secret"
                        type="password"
                        value={s3SecretInput}
                        onChange={(e) => setS3SecretInput(e.target.value)}
                        placeholder={
                          s3SecretStored
                            ? "Stored — leave blank to keep it"
                            : "Enter secret access key"
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        {s3SecretStored
                          ? "A secret is saved and encrypted. Leave this blank to keep it, or type a new one to replace it."
                          : "No secret is saved yet."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3-region">Region</Label>
                      <Input
                        id="s3-region"
                        value={s3Config.region}
                        onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                        placeholder="us-east-1"
                      />
                    </div>
                  </div>
                )}

                {/* Cloudinary Config */}
                {storageProvider === "cloudinary" && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <h4 className="text-sm font-medium">Cloudinary Configuration</h4>
                    <div className="space-y-2">
                      <Label htmlFor="cloudinary-cloud">Cloud Name</Label>
                      <Input
                        id="cloudinary-cloud"
                        value={cloudinaryConfig.cloud_name}
                        onChange={(e) =>
                          setCloudinaryConfig({ ...cloudinaryConfig, cloud_name: e.target.value })
                        }
                        placeholder="my-cloud"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cloudinary-key">API Key</Label>
                      <Input
                        id="cloudinary-key"
                        value={cloudinaryConfig.api_key}
                        onChange={(e) =>
                          setCloudinaryConfig({ ...cloudinaryConfig, api_key: e.target.value })
                        }
                        placeholder="123456789"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cloudinary-secret">API Secret</Label>
                      <Input
                        id="cloudinary-secret"
                        type="password"
                        value={cloudinarySecretInput}
                        onChange={(e) => setCloudinarySecretInput(e.target.value)}
                        placeholder={
                          cloudinarySecretStored
                            ? "Stored — leave blank to keep it"
                            : "Enter API secret"
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        {cloudinarySecretStored
                          ? "A secret is saved and encrypted. Leave this blank to keep it, or type a new one to replace it."
                          : "No secret is saved yet."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Test Connection Result */}
                {storageTestResult && (
                  <div
                    className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                      storageTestResult.success
                        ? "border border-green-200 bg-green-50 text-green-800"
                        : "border border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {storageTestResult.success ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    )}
                    <span>{storageTestResult.message}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={handleTestStorageConnection}
                    disabled={storageTesting || storageSaving}
                  >
                    {storageTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {storageTesting ? "Testing..." : "Test Connection"}
                  </Button>
                  <Button
                    onClick={handleSaveStorageSettings}
                    disabled={storageSaving || storageTesting}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {storageSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Instagram Integration Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5" />
              Instagram Integration
            </CardTitle>
            <CardDescription>
              Sync posts from your Instagram Business account to the gallery
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                {instagramSuccess && (
                  <div className="rounded border-l-4 border-green-500 bg-green-50 p-3 text-sm text-green-700">
                    {instagramSuccess}
                  </div>
                )}
                {instagramError && (
                  <div className="rounded border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-700">
                    {instagramError}
                  </div>
                )}

                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">Enable Instagram Sync</div>
                    <div className="text-muted-foreground text-sm">
                      Automatically sync Instagram posts to the gallery
                    </div>
                  </div>
                  <Switch checked={instagramEnabled} onCheckedChange={setInstagramEnabled} />
                </div>

                {/* Configuration Fields */}
                <div className="space-y-4 rounded-lg border p-4">
                  <h4 className="text-sm font-medium">Instagram API Configuration</h4>
                  <div className="space-y-2">
                    <Label htmlFor="instagram-user-id">Instagram User ID</Label>
                    <Input
                      id="instagram-user-id"
                      value={instagramUserId}
                      onChange={(e) => setInstagramUserId(e.target.value)}
                      placeholder="17841400123456789"
                    />
                    <p className="text-muted-foreground text-xs">
                      Your Instagram Business or Creator account numeric ID
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instagram-access-token">Access Token</Label>
                    <Input
                      id="instagram-access-token"
                      type="password"
                      value={instagramAccessToken}
                      onChange={(e) => setInstagramAccessToken(e.target.value)}
                      placeholder={
                        instagramTokenSet
                          ? "Token is set (enter new value to update)"
                          : "Enter long-lived access token"
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Generate a long-lived token from the{" "}
                      <a
                        href="https://developers.facebook.com/tools/explorer/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary inline-flex items-center gap-1 underline"
                      >
                        Facebook Graph API Explorer
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      . Tokens are valid for 60 days and auto-refresh during sync.
                    </p>
                  </div>
                </div>

                {/* Status Info */}
                {(instagramLastSync || instagramTokenExpires) && (
                  <div className="bg-muted/50 space-y-2 rounded-lg p-4 text-sm">
                    {instagramLastSync && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Last Sync</span>
                        <span>{new Date(instagramLastSync).toLocaleString()}</span>
                      </div>
                    )}
                    {instagramTokenExpires && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Token Expires</span>
                        <span
                          className={
                            new Date(instagramTokenExpires) <
                            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                              ? "font-medium text-amber-600"
                              : ""
                          }
                        >
                          {new Date(instagramTokenExpires).toLocaleDateString()}
                          {new Date(instagramTokenExpires) <
                            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && (
                            <span className="ml-1">(expiring soon)</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={handleInstagramSync}
                    disabled={instagramSyncing || instagramSaving || !instagramEnabled}
                  >
                    {instagramSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {instagramSyncing ? "Syncing..." : "Sync Now"}
                  </Button>
                  <Button
                    onClick={handleSaveInstagramSettings}
                    disabled={instagramSaving || instagramSyncing}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {instagramSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Social Media Section */}
        <Card>
          <CardHeader>
            <CardTitle>Social Media Links</CardTitle>
            <CardDescription>Add your social media profiles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Gated on the load like the cards above. These inputs start
                empty, so rendering them before the fetch resolves showed
                "nothing is set" for links that are set — and anything typed
                in that window was overwritten when the fetch landed. */}
            {settingsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="social-facebook">Facebook</Label>
                  <Input
                    id="social-facebook"
                    type="url"
                    value={socialMedia.facebook}
                    onChange={(e) => setSocialMedia({ ...socialMedia, facebook: e.target.value })}
                    placeholder="https://facebook.com/glambylynn"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="social-instagram">Instagram</Label>
                  <Input
                    id="social-instagram"
                    type="url"
                    value={socialMedia.instagram}
                    onChange={(e) => setSocialMedia({ ...socialMedia, instagram: e.target.value })}
                    placeholder="https://instagram.com/glambylynn"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="social-twitter">Twitter</Label>
                  <Input
                    id="social-twitter"
                    type="url"
                    value={socialMedia.twitter}
                    onChange={(e) => setSocialMedia({ ...socialMedia, twitter: e.target.value })}
                    placeholder="https://twitter.com/glambylynn"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="social-tiktok">TikTok</Label>
                  <Input
                    id="social-tiktok"
                    type="url"
                    value={socialMedia.tiktok}
                    onChange={(e) => setSocialMedia({ ...socialMedia, tiktok: e.target.value })}
                    placeholder="https://tiktok.com/@glambylynn"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="social-youtube">YouTube</Label>
                  <Input
                    id="social-youtube"
                    type="url"
                    value={socialMedia.youtube}
                    onChange={(e) => setSocialMedia({ ...socialMedia, youtube: e.target.value })}
                    placeholder="https://youtube.com/@glambylynn"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveSocialMedia} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment Settings Section */}
        <Card>
          <CardHeader>
            <CardTitle>Payment & Contact Details</CardTitle>
            <CardDescription>
              Shown to customers on the order confirmation page. Leave a field blank to hide it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mpesa-paybill">M-Pesa Paybill / Business Number</Label>
                  <Input
                    id="mpesa-paybill"
                    value={paymentSettings.mpesaPaybill}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, mpesaPaybill: e.target.value })
                    }
                    placeholder="e.g. 247247"
                  />
                  <p className="text-muted-foreground text-sm">
                    Customers use their order number as the account number.
                  </p>
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="font-medium">Bank Transfer</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="bank-name">Bank Name</Label>
                      <Input
                        id="bank-name"
                        value={paymentSettings.bankName}
                        onChange={(e) =>
                          setPaymentSettings({ ...paymentSettings, bankName: e.target.value })
                        }
                        placeholder="e.g. Equity Bank"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bank-account-name">Account Name</Label>
                      <Input
                        id="bank-account-name"
                        value={paymentSettings.bankAccountName}
                        onChange={(e) =>
                          setPaymentSettings({
                            ...paymentSettings,
                            bankAccountName: e.target.value,
                          })
                        }
                        placeholder="e.g. Glam by Lynn"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="bank-account-number">Account Number</Label>
                      <Input
                        id="bank-account-number"
                        value={paymentSettings.bankAccountNumber}
                        onChange={(e) =>
                          setPaymentSettings({
                            ...paymentSettings,
                            bankAccountNumber: e.target.value,
                          })
                        }
                        placeholder="Bank account number"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="font-medium">Payment Confirmation</div>
                  <p className="text-muted-foreground text-sm">
                    Where customers send proof of payment.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="confirmation-phone">WhatsApp / Phone</Label>
                      <Input
                        id="confirmation-phone"
                        value={paymentSettings.confirmationPhone}
                        onChange={(e) =>
                          setPaymentSettings({
                            ...paymentSettings,
                            confirmationPhone: e.target.value,
                          })
                        }
                        placeholder="+254 7XX XXX XXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmation-email">Email</Label>
                      <Input
                        id="confirmation-email"
                        type="email"
                        value={paymentSettings.confirmationEmail}
                        onChange={(e) =>
                          setPaymentSettings({
                            ...paymentSettings,
                            confirmationEmail: e.target.value,
                          })
                        }
                        placeholder="payments@example.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="font-medium">Customer Support Contact</div>
                  <p className="text-muted-foreground text-sm">
                    Shown under &quot;Need Help?&quot; on the confirmation page.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-phone">Phone / WhatsApp</Label>
                      <Input
                        id="contact-phone"
                        value={paymentSettings.contactPhone}
                        onChange={(e) =>
                          setPaymentSettings({ ...paymentSettings, contactPhone: e.target.value })
                        }
                        placeholder="+254 7XX XXX XXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">Email</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        value={paymentSettings.contactEmail}
                        onChange={(e) =>
                          setPaymentSettings({ ...paymentSettings, contactEmail: e.target.value })
                        }
                        placeholder="info@example.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSavePaymentSettings} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
