import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, ShoppingBag, Star, CreditCard } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { localStorageService } from "@/lib/localStorage";
import { useAuthUI } from "@/contexts/AuthUIContext";

const prefetchProduct = (productId: string) => {
  queryClient.prefetchQuery({
    queryKey: ["/api/products", productId],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}`);
      if (!response.ok) throw new Error("Failed to fetch product");
      return response.json();
    },
    staleTime: 60000,
  });
};

interface ProductCardProps {
  id: string;
  baseProductId?: string;
  displayColor?: string;
  name: string;
  image: string;
  secondaryImage?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating?: number;
  reviewCount?: number;
  isNew?: boolean;
  isBestseller?: boolean;
  inStock?: boolean;
  context?: 'new-arrivals' | 'trending' | 'sale' | 'products';
  shortDescription?: string;
  description?: string;
  onAddToCart?: () => void;
  onAddToWishlist?: () => void;
  onBuyNow?: () => void;
  onClick?: () => void;
}

export default function ProductCard({
  id,
  baseProductId,
  displayColor,
  name,
  image,
  secondaryImage,
  price,
  originalPrice,
  discount,
  rating = 0,
  reviewCount = 0,
  isNew,
  isBestseller,
  inStock = true,
  context,
  shortDescription,
  description,
  onAddToCart,
  onAddToWishlist,
  onBuyNow,
  onClick,
}: ProductCardProps) {
  const [currentImage, setCurrentImage] = useState(image);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { openLogin } = useAuthUI();

  const cartProductId = baseProductId || id.split('_variant_')[0];
  const token = localStorage.getItem("token");

  const { data: wishlistData } = useQuery<any>({
    queryKey: ["/api/wishlist"],
    enabled: !!token,
    retry: false,
  });

  const isInApiWishlist = !!wishlistData?.products?.some((item: any) => {
    const idMatch = item._id?.toString() === cartProductId || item._id === cartProductId;
    if (!idMatch) return false;
    if (displayColor) return item.selectedColor === displayColor;
    return true;
  });
  const isInLocalWishlist = !token && localStorageService.isInWishlist(cartProductId, displayColor || null);
  const [isWishlisted, setIsWishlisted] = useState(false);

  useEffect(() => {
    if (token) {
      setIsWishlisted(isInApiWishlist);
    } else {
      setIsWishlisted(isInLocalWishlist);
    }
  }, [isInApiWishlist, isInLocalWishlist, token]);

  // Extract short description from full description
  const displayShortDescription = shortDescription || 
    (description ? description.split(/[.\n]/).find(s => s.trim())?.trim()?.substring(0, 60) : undefined);
  
  // Use the actual product ID (including variant info) for navigation
  const productDetailId = id;

  const addToCartMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/cart", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart successfully!" });
    },
    onError: () => {
      const token = localStorage.getItem("token");
      if (!token) {
        localStorageService.addToCart(cartProductId, 1, displayColor);
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        toast({ title: "Added to cart successfully!" });
      } else {
        toast({ title: "Failed to add to cart", variant: "destructive" });
      }
    },
  });

  const addToWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      apiRequest(`/api/wishlist/${productId}`, "POST", { selectedColor: displayColor || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Added to wishlist!" });
    },
    onError: () => {
      const token = localStorage.getItem("token");
      if (!token) {
        localStorageService.addToWishlist(cartProductId, displayColor || null);
        queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
        toast({ title: "Added to wishlist!" });
      } else {
        toast({ title: "Failed to add to wishlist", variant: "destructive" });
      }
    },
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      apiRequest(`/api/wishlist/${productId}`, "DELETE", { selectedColor: displayColor || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Removed from wishlist!" });
    },
    onError: () => {
      const token = localStorage.getItem("token");
      if (!token) {
        localStorageService.removeFromWishlist(cartProductId, displayColor || null);
        queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
        toast({ title: "Removed from wishlist!" });
      } else {
        toast({ title: "Failed to remove from wishlist", variant: "destructive" });
      }
    },
  });

  const buyNowMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/cart", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      setLocation("/checkout");
    },
    onError: () => {
      toast({ title: "Failed to proceed with Buy Now", variant: "destructive" });
    },
  });

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsWishlisted(!isWishlisted);
    if (onAddToWishlist) {
      onAddToWishlist();
    } else if (isWishlisted) {
      removeFromWishlistMutation.mutate(cartProductId);
    } else {
      addToWishlistMutation.mutate(cartProductId);
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddToCart) {
      onAddToCart();
    } else {
      addToCartMutation.mutate({ 
        productId: cartProductId, 
        quantity: 1,
        selectedColor: displayColor 
      });
    }
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBuyNow) {
      onBuyNow();
    } else {
      const token = localStorage.getItem("token");
      if (!token) {
        toast({ title: "Please login to proceed with Buy Now", variant: "destructive" });
        openLogin();
        return;
      }
      buyNowMutation.mutate({ 
        productId: cartProductId, 
        quantity: 1,
        selectedColor: displayColor 
      });
    }
  };

  const testId = baseProductId 
    ? `card-product-${baseProductId}-variant-${id.split('_variant_')[1] || '0'}`
    : `card-product-${id}`;
  
  return (
    <Card 
      className="overflow-hidden cursor-pointer hover-elevate active-elevate-2 group flex flex-col h-[350px] md:h-[420px] !bg-transparent"
      onClick={() => onClick ? onClick() : setLocation(`/product/${productDetailId}`)}
      onMouseEnter={() => prefetchProduct(productDetailId)}
      data-testid={testId}
    >
      <div className="relative flex-1 overflow-hidden">
        <img
          src={currentImage || "/default-saree.jpg"}
          alt={name}
          className="w-full h-full object-cover"
          onMouseEnter={() => secondaryImage && setCurrentImage(secondaryImage)}
          onMouseLeave={() => setCurrentImage(image)}
          onError={(e) => { e.currentTarget.src = '/default-saree.jpg'; }}
        />
        
        <div className={`absolute top-2 right-2 z-20 rounded-full p-1.5 flex items-center justify-center ${isWishlisted ? 'bg-destructive' : 'bg-white'}`}>
          <button
            onClick={handleWishlist}
            data-testid={`button-wishlist-${id}`}
            className="focus:outline-none"
          >
            <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-white text-white' : 'text-black'}`} />
          </button>
        </div>

        {isBestseller && (
          <div className="absolute top-2 left-2">
            <Star className="h-6 w-6 fill-yellow-400 text-yellow-400 drop-shadow" data-testid={`icon-bestseller-${id}`} />
          </div>
        )}

        {!inStock && (
          <div className="absolute bottom-2 left-2 z-20">
            <span className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg" data-testid={`badge-sold-out-${id}`}>
              Sold Out
            </span>
          </div>
        )}

        {inStock && (
          <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex-col gap-1.5 hidden md:flex">
            <Button 
              className="w-full bg-primary hover:bg-primary text-primary-foreground"
              onClick={handleAddToCart}
              data-testid={`button-add-to-cart-${id}`}
              size="sm"
            >
              <ShoppingBag className="h-4 w-4 mr-2" />
              Add to Cart
            </Button>
            <Button 
              className="w-full"
              variant="secondary"
              onClick={handleBuyNow}
              data-testid={`button-buy-now-${id}`}
              size="sm"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Buy Now
            </Button>
          </div>
        )}
      </div>

      <CardContent className="p-2 md:p-3 flex flex-col flex-shrink-0">
        <h3 className="font-medium text-xs md:text-sm line-clamp-2 leading-snug mb-1" data-testid={`text-product-name-${id}`}>
          {name}
        </h3>

        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
          <span className="text-sm md:text-base font-bold text-black" data-testid={`text-price-${id}`}>
            ₹{price.toLocaleString()}
          </span>
          {originalPrice && (
            <>
              <span className="text-xs text-black line-through" data-testid={`text-original-price-${id}`}>
                ₹{originalPrice.toLocaleString()}
              </span>
              {discount !== undefined && discount > 0 && (
                <span className="text-xs text-black font-medium" data-testid={`text-discount-${id}`}>
                  {discount}% off
                </span>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
