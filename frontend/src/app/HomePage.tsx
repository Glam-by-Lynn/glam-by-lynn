/**
 * Homepage — the interactive half.
 *
 * Featured services, products, categories and testimonials are fetched by the
 * server component in `page.tsx` and passed in, so they're present in the
 * initial HTML. Previously all four were fetched sequentially in a `useEffect`,
 * which meant crawlers and social unfurlers saw the marketing copy but none of
 * the actual catalogue (readiness finding H11).
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import Image from "next/image";
import { API_BASE_URL } from "@/config/api";
import { resolveImageUrl } from "@/lib/utils";
import { Star, ArrowRight, CheckCircle, Sparkles, ShoppingBag, Heart, Eye, Bell, Loader2, Minus, Plus } from "lucide-react";
import { FadeInSection } from "@/components/animations/FadeInSection";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";
import { openCartDrawer } from "@/lib/cartEvents";
import type {
  Category,
  Product,
  ServicePackage,
  Testimonial,
} from "@/types/homepage";

interface HomePageProps {
  featuredServices: ServicePackage[];
  featuredProducts: Product[];
  categories: Category[];
  testimonials: Testimonial[];
}

export default function Home({
  featuredServices,
  featuredProducts,
  categories,
  testimonials,
}: HomePageProps) {
  const router = useRouter();
  const { authenticated, session } = useAuth();

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const { settings: publicSettings } = usePublicSettings();

  // Product card interaction state
  const { items: cartItems, addItem, updateQuantity: updateCartQuantity } = useCart();
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);
  const [updatingCartId, setUpdatingCartId] = useState<string | null>(null);

  const cartMap = new Map<string, { cartItemId: string; quantity: number }>();
  for (const item of cartItems) {
    cartMap.set(item.productId, { cartItemId: item.id, quantity: item.quantity });
  }

  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [togglingWishlistId, setTogglingWishlistId] = useState<string | null>(null);


  // Load wishlist for authenticated users (cart is loaded by useCart)
  useEffect(() => {
    const loadWishlist = async () => {
      if (!authenticated || !session?.accessToken) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/wishlist`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (res.ok) {
          const items = await res.json();
          setWishlistIds(new Set(items.map((item: any) => item.productId)));
        }
      } catch { /* silently fail */ }
    };
    loadWishlist();
  }, [authenticated, session?.accessToken]);

  const handleAddToCart = useCallback(async (product: Product) => {
    setAddingToCartId(product.id);
    try {
      await addItem(
        {
          id: product.id,
          title: product.title,
          slug: product.slug,
          basePrice: Number(product.final_price ?? product.base_price ?? 0),
          inventoryCount: product.inventory_count ?? 0,
          images: product.images?.map((img) => ({
            imageUrl: img.image_url,
            altText: img.alt_text,
          })),
        },
        1,
      );
      openCartDrawer();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add to bag");
    } finally {
      setAddingToCartId(null);
    }
  }, [addItem]);

  const handleUpdateQuantity = useCallback(async (productId: string, delta: number) => {
    const entry = cartMap.get(productId);
    if (!entry) return;
    const newQty = entry.quantity + delta;
    setUpdatingCartId(productId);
    try {
      await updateCartQuantity(entry.cartItemId, newQty);
    } finally {
      setUpdatingCartId(null);
    }
  }, [cartMap, updateCartQuantity]);

  const handleToggleWishlist = useCallback(async (product: Product) => {
    if (!authenticated) {
      router.push("/auth/signin?redirect=/");
      return;
    }
    const isInWishlist = wishlistIds.has(product.id);
    setTogglingWishlistId(product.id);
    try {
      if (isInWishlist) {
        const res = await fetch(`${API_BASE_URL}/api/wishlist/${product.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session?.accessToken}` },
        });
        if (res.ok) {
          setWishlistIds((prev) => { const next = new Set(prev); next.delete(product.id); return next; });
          toast.success("Removed from wishlist");
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/api/wishlist`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.accessToken}`,
          },
          body: JSON.stringify({ productId: product.id }),
        });
        if (res.ok) {
          setWishlistIds((prev) => new Set(prev).add(product.id));
          toast.success("Added to wishlist!");
        }
      }
    } catch {
      toast.error("Failed to update wishlist");
    } finally {
      setTogglingWishlistId(null);
    }
  }, [authenticated, session?.accessToken, wishlistIds, router]);

  const formatProductPrice = (product: Product) => {
    const price = product.final_price ?? product.base_price;
    if (!price) return "Contact for price";
    return `KSh ${parseFloat(price.toString()).toLocaleString()}`;
  };

  const productHasDiscount = (product: Product) =>
    product.discount_type && product.discount_value && product.discount_value > 0;

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterStatus("loading");

    // Simulate newsletter subscription (backend endpoint would be needed)
    try {
      // TODO: Implement backend newsletter endpoint
      await new Promise(resolve => setTimeout(resolve, 1000));
      setNewsletterStatus("success");
      setNewsletterEmail("");
      setTimeout(() => setNewsletterStatus("idle"), 3000);
    } catch (error) {
      setNewsletterStatus("error");
      setTimeout(() => setNewsletterStatus("idle"), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section - Dark gradient matching other pages */}
      <section className="relative overflow-hidden bg-hero-gradient text-white">
        {/* Animated pink glow background effect */}
        <div className="absolute -right-1/2 -top-1/2 h-[200%] w-[200%] bg-pink-subtle animate-hero-pulse" />
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="container relative mx-auto px-4 py-20 md:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-6 px-4 py-2 bg-vision-gradient text-white border-0 shadow-lg shadow-pink-500/30">
              <Sparkles className="mr-2 h-4 w-4 inline" />
              Premium Beauty Services & Products
            </Badge>
            <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-7xl drop-shadow-lg">
              <span className="text-white">Glam by</span>{" "}
              <span className="text-[#FFB6C1]">Lynn</span>
            </h1>
            <p className="mb-8 text-lg text-white/80 md:text-xl lg:text-2xl">
              Makeup artistry at its best
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="group bg-pink-gradient hover:opacity-90 text-white border-0 shadow-lg shadow-pink-500/30">
                <Link href="/services">
                  Book a Service
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="group border-[#FFB6C1] text-[#FFB6C1] hover:bg-[#FFB6C1]/20 hover:text-white">
                <Link href="/products">
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Shop Products
                </Link>
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#FFB6C1]" />
                <span>Professional Certified</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#FFB6C1]" />
                <span>Premium Products</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#FFB6C1]" />
                <span>Based in Kitui & Nairobi</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main>
        {/* Featured Services Section */}
        <section className="border-b border-border bg-gradient-to-b from-secondary/5 to-background py-16 md:py-20">
          <div className="container mx-auto px-4">
            <FadeInSection direction="down" delay={0.1}>
              <div className="mb-12 text-center">
                <Badge variant="secondary" className="mb-4 px-4 py-2">
                  <Sparkles className="mr-2 h-4 w-4 inline" />
                  Our Signature Services
                </Badge>
                <h2 className="mb-4 text-3xl font-bold md:text-4xl">
                  Bridal Makeup Packages
                </h2>
                <p className="text-lg text-muted-foreground">
                  Professional bridal makeup services for your special day
                </p>
              </div>
            </FadeInSection>

            {featuredServices.length > 0 ? (
              <div className="grid gap-8 md:grid-cols-3">
                {featuredServices.map((service, index) => (
                  <FadeInSection key={service.id} direction="up" delay={0.2 + index * 0.1} className="h-full">
                    <Card
                      onClick={() => router.push(`/services/${service.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/services/${service.id}`);
                        }
                      }}
                      className={`group relative flex h-full flex-col overflow-hidden transition-all hover:shadow-xl hover:border-secondary/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${service.image_url ? "pt-0" : ""}`}
                    >
                    {service.image_url ? (
                      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-secondary/20 to-muted">
                        <Image
                          src={resolveImageUrl(service.image_url)}
                          alt={service.name}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-secondary/10 to-transparent rounded-bl-full" />
                    )}
                    <CardHeader className="relative">
                      <CardTitle className="text-xl mb-2">{service.name}</CardTitle>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-secondary">
                          {(() => {
                            const price = parseFloat(service.base_bride_price || service.base_other_price || service.base_maid_price || service.base_mother_price || "");
                            return isNaN(price) ? "Contact for pricing" : `KSh ${price.toLocaleString()}`;
                          })()}
                        </span>
                        {!isNaN(parseFloat(service.base_bride_price || service.base_other_price || service.base_maid_price || service.base_mother_price || "")) && (
                          <span className="text-sm text-muted-foreground">starting</span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col space-y-4">
                      <p className="text-muted-foreground line-clamp-3">{service.description}</p>

                      <div className="flex-1 space-y-2 text-sm">
                        {service.duration_minutes && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 flex-shrink-0 text-secondary" />
                          <span>Duration: {service.duration_minutes >= 1440
                            ? `${Math.floor(service.duration_minutes / 1440)}+ days`
                            : `${Math.floor(service.duration_minutes / 60)}+ hours`}
                          </span>
                        </div>
                        )}
                        {service.includes_facial && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 flex-shrink-0 text-secondary" />
                            <span>Includes facial treatment</span>
                          </div>
                        )}
                        {service.max_maids && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 flex-shrink-0 text-secondary" />
                            <span>Up to {service.max_maids} bridesmaids</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-auto space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            asChild
                            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 active:text-secondary-foreground"
                          >
                            <Link href={`/bookings/new?packageId=${service.id}`}>
                              Book Now
                              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                          </Button>
                          <Button
                            asChild
                            variant="outline"
                            className="border-secondary text-secondary hover:bg-secondary/10 hover:text-secondary"
                          >
                            <Link href={`/services/${service.id}`}>View Details</Link>
                          </Button>
                        </div>
                        <WhatsAppButton
                          variant="outline"
                          label="Book on WhatsApp"
                          className="w-full"
                          context={{ type: "service", service_id: service.id }}
                        />
                      </div>
                    </CardContent>
                    </Card>
                  </FadeInSection>
                ))}
              </div>
            ) : null}

            <FadeInSection direction="up" delay={0.5}>
              <div className="mt-10 text-center">
                <Button asChild size="lg" variant="outline">
                  <Link href="/services">
                    View All Services
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </FadeInSection>
          </div>
        </section>

        {/* Featured Products Section */}
        <section className="border-b border-border bg-background py-16 md:py-20">
          <div className="container mx-auto px-4">
            <FadeInSection direction="down" delay={0.1}>
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold md:text-4xl">
                  Featured Products
                </h2>
                <p className="text-lg text-muted-foreground">
                  Discover our curated selection of premium beauty essentials
                </p>
              </div>
            </FadeInSection>

            {featuredProducts.length > 0 ? (
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {featuredProducts.map((product, index) => {
                  const primaryImage = product.images?.find((img) => img.is_primary) || product.images?.[0];
                  const isOutOfStock = product.inventory_count <= 0;
                  const isInWishlist = wishlistIds.has(product.id);

                  return (
                    <FadeInSection key={product.id} direction="up" delay={0.2 + (index % 3) * 0.1}>
                      <Link
                        href={`/products/${product.id}`}
                        className="group relative flex h-full flex-col rounded-[2rem] border border-pink-50 bg-white overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-pink-100 hover:-translate-y-2"
                      >
                        {/* Badges */}
                        <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-pink-600 shadow-sm">
                            <Sparkles className="h-3 w-3" />
                            Featured
                          </span>
                          {isOutOfStock && (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-gray-500">
                              Sold Out
                            </span>
                          )}
                          {productHasDiscount(product) && !isOutOfStock && (
                            <span className="inline-flex items-center rounded-full bg-rose-500 px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-white shadow-lg">
                              {product.discount_type === "percentage"
                                ? `${product.discount_value}% OFF`
                                : `KSh ${product.discount_value} OFF`}
                            </span>
                          )}
                        </div>

                        {/* Wishlist */}
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleWishlist(product); }}
                          disabled={togglingWishlistId === product.id}
                          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow-sm transition-colors hover:text-pink-500"
                          aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
                        >
                          {togglingWishlistId === product.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-pink-500" />
                          ) : (
                            <Heart className={`h-4 w-4 transition-colors ${isInWishlist ? "fill-pink-500 text-pink-500" : "text-gray-400 hover:text-pink-500"}`} />
                          )}
                        </button>

                        {/* Image */}
                        <div className="relative h-64 overflow-hidden bg-gray-50">
                          {primaryImage ? (
                            <Image
                              src={resolveImageUrl(primaryImage.image_url)}
                              alt={primaryImage.alt_text || product.title}
                              fill
                              className="object-cover transition-transform duration-700 group-hover:scale-110"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <ShoppingBag className="h-10 w-10 text-gray-200" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                            <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black shadow-xl translate-y-4 transition-transform duration-300 group-hover:translate-y-0">
                              <Eye className="h-4 w-4" />
                              Quick View
                            </span>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex flex-1 flex-col p-6 space-y-3">
                          <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-pink-400">
                                {product.category?.name || "Beauty"}
                              </span>
                              <h3 className="font-bold text-lg leading-tight text-[#1a0f1c] line-clamp-2 group-hover:text-pink-600 transition-colors">
                                {product.title}
                              </h3>
                              {product.brand && (
                                <p className="mt-1 text-xs text-gray-400">{product.brand.name}</p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {productHasDiscount(product) ? (
                                <>
                                  <p className="text-sm font-medium text-gray-400 line-through">
                                    KSh {parseFloat(product.base_price.toString()).toLocaleString()}
                                  </p>
                                  <p className="font-black text-xl text-[#1a0f1c]">
                                    {formatProductPrice(product)}
                                  </p>
                                </>
                              ) : (
                                <p className="font-black text-xl text-[#1a0f1c]">
                                  {formatProductPrice(product)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 mt-auto">
                            {isOutOfStock ? (
                              <>
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toast.info("We\u2019ll notify you when this item is back in stock!"); }}
                                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-100 py-3 text-sm font-bold text-gray-400 transition-all hover:border-pink-200 hover:text-pink-500"
                                >
                                  Notify Me
                                </button>
                                <p className="mt-2 text-center text-[10px] font-medium italic text-rose-400">Restocking soon</p>
                              </>
                            ) : cartMap.has(product.id) ? (
                              <div
                                className="flex w-full items-center rounded-2xl border-2 border-pink-200 bg-pink-50 overflow-hidden"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              >
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUpdateQuantity(product.id, -1); }}
                                  disabled={updatingCartId === product.id}
                                  className="flex items-center justify-center px-4 py-3 text-pink-700 hover:bg-pink-100 transition-colors disabled:opacity-50"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <div className="flex-1 flex items-center justify-center border-x border-pink-200 py-3">
                                  {updatingCartId === product.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-pink-600" />
                                  ) : (
                                    <span className="text-sm font-bold text-pink-800">
                                      {cartMap.get(product.id)!.quantity} in bag
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUpdateQuantity(product.id, 1); }}
                                  disabled={updatingCartId === product.id}
                                  className="flex items-center justify-center px-4 py-3 text-pink-700 hover:bg-pink-100 transition-colors disabled:opacity-50"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddToCart(product); }}
                                disabled={addingToCartId === product.id}
                                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-500 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-pink-600 active:scale-95 disabled:opacity-60 disabled:active:scale-100"
                              >
                                {addingToCartId === product.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ShoppingBag className="h-4 w-4" />
                                )}
                                Add to Bag
                              </button>
                            )}
                            <div
                              className="mt-2 flex justify-center"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            >
                              <WhatsAppButton
                                variant="outline"
                                label="Order on WhatsApp"
                                size="sm"
                                context={{ type: "product", product_id: product.id, quantity: 1 }}
                              />
                            </div>
                          </div>
                        </div>
                      </Link>
                    </FadeInSection>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <ShoppingBag className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>No featured products yet</p>
              </div>
            )}

            <FadeInSection direction="up" delay={0.5}>
              <div className="mt-10 text-center">
                <Button asChild size="lg" variant="outline">
                  <Link href="/products">
                    View All Products
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </FadeInSection>
          </div>
        </section>

        {/* Categories Section */}
        <section className="bg-muted/30 py-16 md:py-20">
          <div className="container mx-auto px-4">
            <FadeInSection direction="down" delay={0.1}>
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold md:text-4xl">
                  Shop by Category
                </h2>
                <p className="text-lg text-muted-foreground">
                  Find exactly what you're looking for
                </p>
              </div>
            </FadeInSection>

            {categories.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {categories.map((category, index) => (
                  <FadeInSection key={category.id} direction="up" delay={0.2 + (index % 4) * 0.1}>
                    <Link
                      href={`/products?category=${category.slug}`}
                      className="group relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-pink-50 bg-white transition-all duration-500 hover:shadow-2xl hover:shadow-pink-100 hover:-translate-y-2"
                    >
                      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-secondary/20 to-muted">
                        {category.image_url ? (
                          <Image
                            src={resolveImageUrl(category.image_url)}
                            alt={category.name}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Sparkles className="h-16 w-16 text-muted-foreground/30" />
                          </div>
                        )}
                        {/* Pink accent + hover CTA */}
                        <div className="absolute inset-0 bg-gradient-to-t from-pink-600/30 via-transparent to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-90" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center pb-4 opacity-0 translate-y-3 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-1.5 text-xs font-bold text-pink-600 shadow-lg backdrop-blur-sm">
                            Shop Now
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                          </span>
                        </div>
                      </div>
                      <div className="bg-gradient-to-b from-pink-50/40 to-white p-4 text-center">
                        <h3 className="text-lg font-bold text-[#1a0f1c] transition-colors group-hover:text-pink-600">
                          {category.name}
                        </h3>
                        {category.product_count !== undefined && (
                          <p className="text-sm text-muted-foreground">
                            {category.product_count} products
                          </p>
                        )}
                      </div>
                    </Link>
                  </FadeInSection>
                ))}
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {["Makeup", "Skincare", "Tools", "Accessories"].map((name) => (
                  <div key={name} className="overflow-hidden rounded-[2rem] border border-pink-50 bg-white">
                    <div className="aspect-square bg-gradient-to-br from-secondary/20 to-muted" />
                    <div className="bg-gradient-to-b from-pink-50/40 to-white p-4 text-center">
                      <h3 className="text-lg font-bold text-[#1a0f1c]">{name}</h3>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="border-t border-border py-16 md:py-20">
          <div className="container mx-auto px-4">
            <FadeInSection direction="down" delay={0.1}>
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold md:text-4xl">
                  What Our Clients Say
                </h2>
                <p className="text-lg text-muted-foreground">
                  Real experiences from real people
                </p>
              </div>
            </FadeInSection>

            {testimonials.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {testimonials.map((testimonial, index) => (
                  <FadeInSection key={testimonial.id} direction="up" delay={0.2 + (index % 3) * 0.1}>
                    <Card className="flex flex-col">
                    <CardHeader>
                      <div className="mb-2 flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < testimonial.rating
                                ? "fill-secondary text-secondary"
                                : "text-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <CardTitle className="text-lg">{testimonial.customerName}</CardTitle>
                      {testimonial.location && (
                        <p className="text-sm text-muted-foreground">
                          {testimonial.location}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-muted-foreground">&ldquo;{testimonial.testimonialText}&rdquo;</p>
                    </CardContent>
                    </Card>
                  </FadeInSection>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Star className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>No testimonials yet</p>
              </div>
            )}

            <FadeInSection direction="up" delay={0.5}>
              <div className="mt-10 text-center">
                <Button asChild variant="outline" size="lg">
                  <Link href="/gallery">
                    View Our Work
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </FadeInSection>
          </div>
        </section>

        {/* Newsletter Section - only shown when enabled by admin */}
        {publicSettings.enable_newsletter && (
        <section className="bg-gradient-to-br from-secondary/10 via-background to-muted/20 py-16 md:py-20">
          <div className="container mx-auto px-4">
            <FadeInSection direction="up" delay={0.2}>
              <Card className="mx-auto max-w-2xl border-2 border-secondary/20">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl md:text-3xl">
                  Join Our Beauty Community
                </CardTitle>
                <p className="text-muted-foreground">
                  Get exclusive tips, product launches, and special offers delivered to your inbox
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleNewsletterSubmit} className="flex flex-col gap-4 sm:flex-row">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    required
                    disabled={newsletterStatus === "loading"}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={newsletterStatus === "loading"}
                    className="whitespace-nowrap"
                  >
                    {newsletterStatus === "loading" ? "Subscribing..." : "Subscribe"}
                  </Button>
                </form>
                {newsletterStatus === "success" && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Successfully subscribed! Check your inbox.</span>
                  </div>
                )}
                {newsletterStatus === "error" && (
                  <div className="mt-4 text-center text-sm text-red-600">
                    Something went wrong. Please try again.
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-center text-xs text-muted-foreground">
                We respect your privacy. Unsubscribe at any time.
              </CardFooter>
              </Card>
            </FadeInSection>
          </div>
        </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
