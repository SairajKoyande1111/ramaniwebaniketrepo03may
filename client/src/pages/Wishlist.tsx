import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Heart, ShoppingCart, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { localStorageService } from "@/lib/localStorage";
import { useState, useEffect } from "react";

export default function Wishlist() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const token = localStorage.getItem("token");
  const [guestWishlist, setGuestWishlist] = useState<any>(null);

  const { data: wishlist, isLoading, isError, error } = useQuery({
    queryKey: ["/api/wishlist"],
    enabled: !!token,
  });

  useEffect(() => {
    if (!token) {
      const localWishlist = localStorageService.getWishlist();
      const fetchProducts = async () => {
        const productPromises = localWishlist.products.map(async (item) => {
          const response = await fetch(`/api/products/${item.productId}`);
          const product = await response.json();
          const selectedColor = item.selectedColor || null;
          const colorVariant = selectedColor
            ? product.colorVariants?.find((v: any) => v.color === selectedColor)
            : null;
          const displayImages =
            colorVariant?.images?.length
              ? colorVariant.images
              : product.colorVariants?.[0]?.images?.length
              ? product.colorVariants[0].images
              : product.images || [];
          return { ...product, selectedColor, displayImages };
        });
        const products = await Promise.all(productPromises);
        setGuestWishlist({ products });
      };
      if (localWishlist.products.length > 0) {
        fetchProducts();
      } else {
        setGuestWishlist({ products: [] });
      }
    }
  }, [token]);

  const isUnauthorized = isError && error && String(error).includes("401:");

  const removeFromWishlistMutation = useMutation({
    mutationFn: ({ productId, selectedColor }: { productId: string; selectedColor?: string | null }) => {
      if (!token) {
        localStorageService.removeFromWishlist(productId, selectedColor);
        return Promise.resolve();
      }
      return apiRequest(`/api/wishlist/${productId}`, "DELETE", { selectedColor: selectedColor || null });
    },
    onSuccess: () => {
      if (token) {
        queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      } else {
        const localWishlist = localStorageService.getWishlist();
        const fetchProducts = async () => {
          const productPromises = localWishlist.products.map(async (item) => {
            const response = await fetch(`/api/products/${item.productId}`);
            const product = await response.json();
            const selectedColor = item.selectedColor || null;
            const colorVariant = selectedColor
              ? product.colorVariants?.find((v: any) => v.color === selectedColor)
              : null;
            const displayImages =
              colorVariant?.images?.length
                ? colorVariant.images
                : product.colorVariants?.[0]?.images?.length
                ? product.colorVariants[0].images
                : product.images || [];
            return { ...product, selectedColor, displayImages };
          });
          const products = await Promise.all(productPromises);
          setGuestWishlist({ products });
        };
        fetchProducts();
      }
      toast({ title: "Removed from wishlist" });
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: ({ productId, selectedColor }: { productId: string; selectedColor?: string | null }) => {
      if (!token) {
        localStorageService.addToCart(productId, 1, selectedColor || undefined);
        return Promise.resolve();
      }
      return apiRequest("/api/cart", "POST", { productId, quantity: 1, selectedColor: selectedColor || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to add to cart", variant: "destructive" });
    },
  });

  if (token && isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">Loading wishlist...</div>
        <Footer />
      </div>
    );
  }

  if (!token && !guestWishlist) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">Loading wishlist...</div>
        <Footer />
      </div>
    );
  }

  const products = token ? ((wishlist as any)?.products || []) : (guestWishlist?.products || []);

  if (products.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="text-center py-12">
            <Heart className="h-24 w-24 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Your wishlist is empty</h2>
            <p className="text-muted-foreground mb-6">Save items you love to buy them later</p>
            <Button onClick={() => setLocation("/products")} data-testid="button-shop-now">
              Shop Now
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8" data-testid="text-page-title">
          My Wishlist ({products.length} items)
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product: any, idx: number) => {
            const productId = product._id;
            const selectedColor = product.selectedColor || null;

            const displayImage =
              (selectedColor && product.colorVariants?.find((v: any) => v.color === selectedColor)?.images?.[0]) ||
              product.displayImages?.[0] ||
              product.colorVariants?.[0]?.images?.[0] ||
              product.images?.[0] ||
              "/default-saree.jpg";

            return (
              <div
                key={`${productId}-${selectedColor || 'default'}-${idx}`}
                className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
                data-testid={`wishlist-item-${productId}`}
              >
                <div className="relative">
                  <img
                    src={displayImage}
                    alt={product.name}
                    className="w-full h-72 object-cover cursor-pointer"
                    onClick={() => {
                      if (selectedColor && product.colorVariants) {
                        const colorIndex = product.colorVariants.findIndex((v: any) => v.color === selectedColor);
                        if (colorIndex >= 0) {
                          setLocation(`/product/${productId}_variant_${colorIndex}`);
                          return;
                        }
                      }
                      setLocation(`/product/${productId}`);
                    }}
                    data-testid={`img-product-${productId}`}
                    onError={(e) => { e.currentTarget.src = '/default-saree.jpg'; }}
                  />

                  <button
                    className="absolute top-3 right-3 z-10 bg-white dark:bg-zinc-900 border border-border rounded-full p-1.5 shadow hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    onClick={() => removeFromWishlistMutation.mutate({ productId, selectedColor })}
                    data-testid={`button-remove-${productId}`}
                    title="Remove from wishlist"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>

                  {!product.inStock && (
                    <div className="absolute top-3 left-3 bg-red-500 text-white px-2 py-1 text-xs font-semibold rounded">
                      Out of Stock
                    </div>
                  )}
                  {product.isNew && product.inStock && (
                    <div className="absolute top-3 left-3 bg-green-500 text-white px-2 py-1 text-xs font-semibold rounded">
                      New
                    </div>
                  )}
                </div>

                <div className="flex flex-col flex-1 p-4">
                  <h3
                    className="font-semibold text-base mb-1 line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => {
                      if (selectedColor && product.colorVariants) {
                        const colorIndex = product.colorVariants.findIndex((v: any) => v.color === selectedColor);
                        if (colorIndex >= 0) {
                          setLocation(`/product/${productId}_variant_${colorIndex}`);
                          return;
                        }
                      }
                      setLocation(`/product/${productId}`);
                    }}
                    data-testid={`text-product-name-${productId}`}
                  >
                    {product.name}
                  </h3>

                  {product.description && (
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2" data-testid={`text-product-desc-${productId}`}>
                      {product.description}
                    </p>
                  )}

                  {selectedColor && (
                    <div className="mb-2">
                      <span className="inline-block text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full border border-primary/20">
                        Color: {selectedColor}
                      </span>
                    </div>
                  )}

                  {!selectedColor && product.fabric && (
                    <p className="text-xs text-muted-foreground mb-2">{product.fabric}</p>
                  )}

                  <div className="flex items-center gap-2 mb-4 mt-auto">
                    <span className="text-lg font-bold text-primary" data-testid={`text-price-${productId}`}>
                      ₹{product.price?.toLocaleString()}
                    </span>
                    {product.originalPrice && (
                      <span className="text-sm text-muted-foreground line-through">
                        ₹{product.originalPrice?.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => addToCartMutation.mutate({ productId, selectedColor })}
                    disabled={!product.inStock || addToCartMutation.isPending}
                    data-testid={`button-add-to-cart-${productId}`}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {product.inStock ? "Add to Cart" : "Out of Stock"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Footer />
    </div>
  );
}
