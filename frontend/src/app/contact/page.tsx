/**
 * Contact Page
 * Contact form and information
 */

"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Facebook, Instagram, Twitter, Youtube } from "lucide-react";
import { usePublicSettings } from "@/hooks/usePublicSettings";

export default function ContactPage() {
  const { settings: publicSettings } = usePublicSettings();

  const hasSocialLinks = publicSettings.social_facebook || publicSettings.social_instagram || publicSettings.social_twitter || publicSettings.social_tiktok || publicSettings.social_youtube;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="border-b border-border bg-gradient-to-b from-background to-muted/20 px-4 py-16 md:py-24">
        <div className="container mx-auto">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              Get In Touch
            </Badge>
            <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
              Contact Us
            </h1>
            <p className="text-lg text-muted-foreground">
              Have questions about our services or ready to book? We&apos;d love to hear from you
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-16">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
          {/* Message us — WhatsApp */}
          <Card>
            <CardHeader>
              <CardTitle>Send us a Message</CardTitle>
              <CardDescription>
                WhatsApp is the fastest way to reach us — messages go straight to
                Lynn&apos;s phone and you&apos;ll usually get a reply the same day.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tell us about your event, the look you have in mind, or anything
                you&apos;d like to ask about our services and products.
              </p>

              <WhatsAppButton
                context={{ type: "general" }}
                label="Chat with us on WhatsApp"
                className="w-full"
                size="lg"
              />

              {(publicSettings.contact_email || publicSettings.contact_phone) && (
                <div className="border-t pt-4 text-sm text-muted-foreground">
                  <p className="mb-2">Prefer not to use WhatsApp?</p>
                  <div className="space-y-1">
                    {publicSettings.contact_email && (
                      <p>
                        Email us at{" "}
                        <a
                          className="text-secondary underline"
                          href={`mailto:${publicSettings.contact_email}`}
                        >
                          {publicSettings.contact_email}
                        </a>
                      </p>
                    )}
                    {publicSettings.contact_phone && (
                      <p>
                        Call us on{" "}
                        <a
                          className="text-secondary underline"
                          href={`tel:${publicSettings.contact_phone}`}
                        >
                          {publicSettings.contact_phone}
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Information */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>
                  Reach out through any of these channels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Shown only when set in admin settings — better an absent row
                    than an invented address or number. */}
                {publicSettings.contact_email && (
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">📧</div>
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">
                        {publicSettings.contact_email}
                      </p>
                    </div>
                  </div>
                )}
                {publicSettings.contact_phone && (
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">📱</div>
                    <div>
                      <p className="font-medium">Phone</p>
                      <p className="text-sm text-muted-foreground">
                        {publicSettings.contact_phone}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="text-2xl">💬</div>
                  <div>
                    <p className="font-medium">WhatsApp</p>
                    <p className="text-sm text-muted-foreground">
                      The quickest way to reach us — use the{" "}
                      <span className="whitespace-nowrap">&ldquo;Chat with us on WhatsApp&rdquo;</span>{" "}
                      button
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-2xl">📍</div>
                  <div>
                    <p className="font-medium">Location</p>
                    <p className="text-sm text-muted-foreground">
                      Kitui &amp; Nairobi, Kenya
                    </p>
                  </div>
                </div>
                {hasSocialLinks && (
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">✨</div>
                    <div className="flex-1">
                      <p className="font-medium">Follow Us</p>
                      <p className="mb-3 text-sm text-muted-foreground">
                        Our latest work and beauty tips
                      </p>
                      {/* Wraps: up to five links, in a narrower column than the
                          standalone card these used to live in. */}
                      <div className="flex flex-wrap gap-2">
                      {publicSettings.social_instagram && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={publicSettings.social_instagram} target="_blank" rel="noopener noreferrer">
                            <Instagram className="mr-1.5 h-4 w-4" />
                            Instagram
                          </Link>
                        </Button>
                      )}
                      {publicSettings.social_facebook && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={publicSettings.social_facebook} target="_blank" rel="noopener noreferrer">
                            <Facebook className="mr-1.5 h-4 w-4" />
                            Facebook
                          </Link>
                        </Button>
                      )}
                      {publicSettings.social_twitter && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={publicSettings.social_twitter} target="_blank" rel="noopener noreferrer">
                            <Twitter className="mr-1.5 h-4 w-4" />
                            Twitter
                          </Link>
                        </Button>
                      )}
                      {publicSettings.social_tiktok && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={publicSettings.social_tiktok} target="_blank" rel="noopener noreferrer">
                            TikTok
                          </Link>
                        </Button>
                      )}
                      {publicSettings.social_youtube && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={publicSettings.social_youtube} target="_blank" rel="noopener noreferrer">
                            <Youtube className="mr-1.5 h-4 w-4" />
                            YouTube
                          </Link>
                        </Button>
                      )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>


          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
