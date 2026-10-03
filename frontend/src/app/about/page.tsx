/**
 * About Page
 * Information about Glam by Lynn and services
 */

"use client";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const values = [
  {
    title: "Professional Excellence",
    description: "Years of experience and continuous training in the latest makeup techniques and trends",
  },
  {
    title: "Personalized Service",
    description: "Every client receives customized attention to enhance their natural beauty and unique style",
  },
  {
    title: "Premium Products",
    description: "We use only high-quality, professional-grade makeup products for lasting results",
  },
  {
    title: "Client Satisfaction",
    description: "Your happiness and confidence are our top priorities in every service we provide",
  },
];

const achievements = [
  "Award-Winning Makeup Artist",
  "Certified Professional Makeup Artist",
  "Almost a Decade of Industry Experience",
  "500+ Satisfied Clients",
  "Specialized in Bridal & Event Makeup",
  "Featured in Local Beauty Publications",
  "Trained in Advanced Makeup Techniques",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="border-b border-border bg-gradient-to-b from-background to-muted/20 px-4 py-16 md:py-24">
        <div className="container mx-auto">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              Our Story
            </Badge>
            <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
              About <span className="text-secondary">Lynn</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Passionate about enhancing natural beauty and creating unforgettable looks for life's special moments
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-16">
        {/* About Story */}
        <div className="mx-auto mb-16 max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Welcome to Glam by Lynn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                With almost a decade of experience in the beauty industry, Lynn has built a reputation
                for creating stunning, personalized makeup looks that enhance each client's natural beauty.
              </p>
              <p>
                What started as a passion for artistry has blossomed into a full-service beauty business,
                offering professional makeup services for weddings, special events, and everyday glamour.
                Every client receives dedicated attention and expert technique to ensure they look and feel
                their absolute best.
              </p>
              <p>
                At Glam by Lynn, we believe that makeup is more than just products and application—it's
                about confidence, self-expression, and celebrating life's most precious moments.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Values Grid */}
        <div className="mb-16">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-3xl font-bold">Our Values</h2>
            <p className="text-muted-foreground">
              What sets us apart in the beauty industry
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{value.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div className="mb-16">
          <Card className="border-secondary/50">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Credentials & Experience</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {achievements.map((achievement, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4"
                  >
                    <span className="mt-0.5 text-secondary">✓</span>
                    <span className="text-sm">{achievement}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="mx-auto max-w-3xl">
          <Card className="border-secondary/50 bg-gradient-to-br from-background to-muted/20">
            <CardContent className="p-8 text-center">
              <h3 className="mb-4 text-2xl font-bold">
                Ready to Experience the <span className="text-secondary">Lynn</span> Difference?
              </h3>
              <p className="mb-6 text-muted-foreground">
                Book a consultation or explore our services to find the perfect beauty solution for you
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/services">View Services</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/contact">Contact Us</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
