import { ShoppingBag, Heart, User, Search, Menu, LogOut, ChevronRight, Loader2, X } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import instagramIcon from "@assets/instagram_1762445939344.png";
import facebookIcon from "@assets/communication_1762445935759.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { LoginDialog } from "@/components/LoginDialog";
import { auth } from "@/lib/auth";
import { useAuthUI } from "@/contexts/AuthUIContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import logoImage from "@assets/PNG__B_ LOGO_1762442171742.png";
import AnnouncementBar from "@/components/AnnouncementBar";

interface HeaderProps {
  cartCount?: number;
  wishlistCount?: number;
  onMenuClick?: () => void;
}

interface SearchProduct {
  _id: string;
  baseProductId: string;
  name: string;
  variantName?: string;
  price: number;
  originalPrice?: number;
  category: string;
  onSale?: boolean;
  displayColor?: string;
  displayImage: string;
}

interface ApiSubCategory {
  name: string;
  slug: string;
  image: string;
  subCategories: ApiSubCategory[];
}

interface ApiCategory {
  _id: string;
  name: string;
  slug: string;
  image: string;
  subCategories: ApiSubCategory[];
  order: number;
}

interface CategoryMenuItem {
  label: string;
  param: string;
  subCategories: { label: string; param: string }[];
}

export default function Header({ cartCount = 0, wishlistCount = 0, onMenuClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [storageUpdateTrigger, setStorageUpdateTrigger] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [openMobileSubCategory, setOpenMobileSubCategory] = useState<string | null>(null);
  const [hoveredMainCategory, setHoveredMainCategory] = useState<string | null>(null);
  const { isLoginOpen, openLogin, closeLogin } = useAuthUI();

  // Fetch categories from API
  const { data: apiCategories } = useQuery<ApiCategory[]>({
    queryKey: ["/api/categories"],
  });

  // Map API categories → dropdown menu format
  const categoryMenu: CategoryMenuItem[] = (apiCategories ?? []).map((cat) => ({
    label: cat.name,
    param: `mainCategory=${encodeURIComponent(cat.name)}`,
    subCategories: cat.subCategories.map((sub) => ({
      label: sub.name,
      param: `category=${encodeURIComponent(sub.name)}`,
    })),
  }));
  
  // Search dropdown state
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function
  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.products || []);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle search input change with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowDropdown(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // Handle search input focus
  const handleSearchFocus = () => {
    setShowDropdown(true);
    if (searchQuery.trim().length >= 2 && searchResults.length === 0) {
      performSearch(searchQuery);
    }
  };

  // Handle product click from search results — navigate to products listing page showing all color variants
  const handleProductClick = (productId: string, baseProductId?: string, productName?: string) => {
    setShowDropdown(false);
    setSearchBarOpen(false);
    const nameQuery = productName || "";
    setSearchQuery("");
    setSearchResults([]);
    setLocation(`/products?search=${encodeURIComponent(nameQuery)}`);
  };

  // Handle search submit (Enter key or search all)
  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) {
      setShowDropdown(false);
      setLocation(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Parse URL to determine active navigation state
  const getActiveNavState = () => {
    try {
      const url = new URL(window.location.href);
      const pathname = url.pathname;
      const searchParams = url.searchParams;
      const hash = url.hash;
      
      const hasCategory = pathname === "/products" && searchParams.has("category");
      const isOnContactSection = pathname === "/" && hash === "#contact";
      
      return {
        isHome: pathname === "/" && hash !== "#contact",
        isNewArrivals: pathname === "/new-arrivals",
        isTrending: pathname === "/trending-collection",
        isCategories: pathname === "/products" && (hasCategory || pathname === "/products"),
        isSale: pathname === "/sale",
        isBestSeller: pathname === "/bestseller",
        isContact: isOnContactSection
      };
    } catch {
      // Fallback for environments without window
      return {
        isHome: location === "/" && !location.includes("#contact"),
        isNewArrivals: location === "/new-arrivals",
        isTrending: location === "/trending-collection",
        isCategories: location.includes("/products"),
        isSale: location === "/sale",
        isBestSeller: location === "/bestseller",
        isContact: location.includes("#contact")
      };
    }
  };

  const navState = getActiveNavState();

  const { data: cart } = useQuery({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  const { data: wishlist } = useQuery({
    queryKey: ["/api/wishlist"],
    enabled: !!user,
  });

  // Calculate cart count with fallback to local storage for guest users
  const getCartCount = () => {
    if (user && cart) {
      return (cart as any)?.items?.length || 0;
    }
    // Fallback to local storage for guest users
    const guestCart = localStorage.getItem("guest_cart");
    if (guestCart) {
      try {
        const parsedCart = JSON.parse(guestCart);
        return parsedCart.items?.length || 0;
      } catch {
        return 0;
      }
    }
    return cartCount;
  };

  // Calculate wishlist count with fallback to local storage for guest users
  const getWishlistCount = () => {
    if (user && wishlist) {
      return (wishlist as any)?.products?.length || 0;
    }
    // Fallback to local storage for guest users
    const guestWishlist = localStorage.getItem("guest_wishlist");
    if (guestWishlist) {
      try {
        const parsedWishlist = JSON.parse(guestWishlist);
        return parsedWishlist.products?.length || 0;
      } catch {
        return 0;
      }
    }
    return wishlistCount;
  };

  const actualCartCount = getCartCount();
  const actualWishlistCount = getWishlistCount();

  useEffect(() => {
    // Check for both old "user" format and new "customer" format
    const loadUser = () => {
      const storedUser = localStorage.getItem("user");
      const customer = auth.getCustomer();
      
      if (customer) {
        setUser(customer);
      } else if (storedUser) {
        setUser(JSON.parse(storedUser));
      } else {
        setUser(null);
      }
    };

    loadUser();

    // Listen for cart/wishlist updates in localStorage
    const handleStorageChange = () => {
      setStorageUpdateTrigger(prev => prev + 1);
    };

    // Listen for auth changes
    const unsubscribe = auth.onAuthChange(loadUser);

    // Listen for custom events (when localStorage is updated programmatically in the same window)
    window.addEventListener('cartUpdated', handleStorageChange);
    window.addEventListener('wishlistUpdated', handleStorageChange);
    
    // Cleanup
    return () => {
      unsubscribe();
      window.removeEventListener('cartUpdated', handleStorageChange);
      window.removeEventListener('wishlistUpdated', handleStorageChange);
    };
  }, []);

  const handleLogout = () => {
    // Use auth utility to clear all auth data
    auth.logout();
    localStorage.removeItem("user");
    setUser(null);
    // Clear cart and other user-specific query caches
    queryClient.removeQueries({ queryKey: ["/api/cart"] });
    queryClient.removeQueries({ queryKey: ["/api/wishlist"] });
    queryClient.removeQueries({ queryKey: ["/api/addresses"] });
    queryClient.removeQueries({ queryKey: ["/api/orders"] });
    setLocation("/");
  };

  const handleContactClick = (e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    setLocation("/");
    setTimeout(() => {
      const contactSection = document.getElementById("contact");
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const handleHomeClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (location === "/") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setLocation("/");
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white">
      <AnnouncementBar />
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Left section - Mobile menu and Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="button-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <Link href="/" className="flex items-center flex-shrink-0">
              <img 
                src={logoImage}
                alt="Ramani Fashion" 
                className="h-14 md:h-16 lg:h-20 w-auto object-contain"
                data-testid="img-logo"
              />
            </Link>
          </div>

          {/* Center section - Desktop Navigation */}
          <nav className="hidden md:flex flex-1 justify-center">
              <NavigationMenu>
                <NavigationMenuList className="flex items-center gap-1 lg:gap-2">
                  <NavigationMenuItem>
                    <a 
                      href="/" 
                      onClick={handleHomeClick} 
                      className={`nav-link px-2 lg:px-3 py-2 tracking-wide text-sm lg:text-base font-medium whitespace-nowrap ${navState.isHome ? "active text-primary" : ""}`} 
                      data-testid="link-home"
                    >
                      HOME
                    </a>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <Link 
                      href="/new-arrivals" 
                      className={`nav-link px-2 lg:px-3 py-2 tracking-wide text-sm lg:text-base font-medium whitespace-nowrap ${navState.isNewArrivals ? "active text-primary" : ""}`} 
                      data-testid="link-new-arrivals"
                    >
                      NEW ARRIVALS
                    </Link>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <Link 
                      href="/trending-collection" 
                      className={`nav-link px-2 lg:px-3 py-2 tracking-wide text-sm lg:text-base font-medium whitespace-nowrap ${navState.isTrending ? "active text-primary" : ""}`} 
                      data-testid="link-trending-collection"
                    >
                      TRENDING
                    </Link>
                  </NavigationMenuItem>
                  {/* Custom Categories dropdown – bypasses NavigationMenuViewport so it anchors directly below the trigger */}
                  <NavigationMenuItem>
                    <div
                      className="relative"
                      onMouseEnter={() => setHoveredMainCategory(hoveredMainCategory ?? "__open__")}
                      onMouseLeave={() => setHoveredMainCategory(null)}
                    >
                      {/* Trigger button */}
                      <button
                        className={`nav-link flex items-center gap-1 px-2 lg:px-3 py-2 tracking-wide text-sm lg:text-base font-medium whitespace-nowrap bg-transparent border-0 cursor-pointer ${navState.isCategories ? "active text-primary" : ""}`}
                        data-testid="link-categories"
                      >
                        CATEGORIES
                        <ChevronRight className="h-3.5 w-3.5 rotate-90 opacity-60" />
                      </button>

                      {/* Dropdown panel – absolutely anchored below the trigger */}
                      {hoveredMainCategory !== null && categoryMenu.length > 0 && (
                        <div className="absolute left-0 top-full z-50 flex shadow-lg border border-gray-100 rounded-md bg-white overflow-hidden">
                          {/* Level 1: main categories */}
                          <ul className="py-2 min-w-[180px]">
                            {categoryMenu.map((cat) => (
                              <li
                                key={cat.label}
                                className={`flex items-center justify-between px-4 py-2.5 cursor-pointer text-sm font-medium transition-colors whitespace-nowrap ${hoveredMainCategory === cat.label ? "bg-pink-50 text-pink-600" : "text-gray-700 hover:bg-pink-50 hover:text-pink-600"}`}
                                onMouseEnter={() => setHoveredMainCategory(cat.label)}
                                onClick={() => {
                                  setHoveredMainCategory(null);
                                  setLocation(`/products?${cat.param}`);
                                }}
                                data-testid={`category-main-${cat.label.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <span>{cat.label}</span>
                                {cat.subCategories.length > 0 && (
                                  <ChevronRight className="h-4 w-4 ml-3 text-gray-400" />
                                )}
                              </li>
                            ))}
                          </ul>

                          {/* Level 2: sub-categories, shown when a parent is hovered */}
                          {hoveredMainCategory && hoveredMainCategory !== "__open__" && categoryMenu.find(c => c.label === hoveredMainCategory)?.subCategories.length ? (
                            <ul className="py-2 min-w-[210px] border-l border-gray-100 bg-white">
                              {categoryMenu.find(c => c.label === hoveredMainCategory)!.subCategories.map((sub) => (
                                <li key={sub.label}>
                                  <Link
                                    href={`/products?${sub.param}`}
                                    className="block px-4 py-2.5 text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors whitespace-nowrap"
                                    onClick={() => setHoveredMainCategory(null)}
                                    data-testid={`category-sub-${sub.label.toLowerCase().replace(/\s+/g, '-')}`}
                                  >
                                    {sub.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <Link 
                      href="/sale" 
                      className={`nav-link px-2 lg:px-3 py-2 tracking-wide text-sm lg:text-base font-medium whitespace-nowrap ${navState.isSale ? "active text-primary" : ""}`} 
                      data-testid="link-sale"
                    >
                      SALE
                    </Link>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <Link 
                      href="/bestseller" 
                      className={`nav-link px-2 lg:px-3 py-2 tracking-wide text-sm lg:text-base font-medium whitespace-nowrap ${navState.isBestSeller ? "active text-primary" : ""}`} 
                      data-testid="link-bestseller"
                    >
                      BEST SELLER
                    </Link>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <button 
                      onClick={handleContactClick} 
                      className={`nav-link px-2 lg:px-3 py-2 tracking-wide text-sm lg:text-base font-medium bg-transparent border-0 cursor-pointer whitespace-nowrap ${navState.isContact ? "active text-primary" : ""}`}
                      data-testid="link-contact"
                    >
                      CONTACT
                    </button>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </nav>

          {/* Right section - Icons */}
          <div className="flex items-center justify-end gap-1 md:gap-2 flex-shrink-0">
            {/* Search Button */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 md:h-11 md:w-11 [&_svg]:!size-[18px] md:[&_svg]:!size-5"
              onClick={() => {
                setSearchBarOpen(!searchBarOpen);
                if (!searchBarOpen) {
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }
              }}
              data-testid="button-search-toggle"
            >
              <Search />
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 md:h-11 md:w-11 hover:bg-gray-100 [&_svg]:!size-[18px] md:[&_svg]:!size-5" data-testid="button-account">
                    <User />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5 text-sm font-semibold">
                    {user.name}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/profile")} data-testid="menu-profile">
                    My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/orders")} data-testid="menu-orders">
                    My Orders
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/wishlist")} data-testid="menu-wishlist">
                    My Wishlist
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 md:h-11 md:w-11 hover:bg-gray-100 [&_svg]:!size-[18px] md:[&_svg]:!size-5" 
                onClick={openLogin} 
                data-testid="button-login"
              >
                <User />
              </Button>
            )}
            
            <Button variant="ghost" size="icon" className="relative h-10 w-10 md:h-11 md:w-11 hover:bg-gray-100 [&_svg]:!size-[18px] md:[&_svg]:!size-5" onClick={() => setLocation("/wishlist")} data-testid="button-wishlist">
              <Heart />
              {actualWishlistCount > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 text-[10px]"
                  data-testid="badge-wishlist-count"
                >
                  {actualWishlistCount}
                </Badge>
              )}
            </Button>
            
            <Button variant="ghost" size="icon" className="relative h-10 w-10 md:h-11 md:w-11 hover:bg-gray-100 [&_svg]:!size-[18px] md:[&_svg]:!size-5" onClick={() => setLocation("/cart")} data-testid="button-bag">
              <ShoppingBag />
              {actualCartCount > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 text-[10px]"
                  data-testid="badge-cart-count"
                >
                  {actualCartCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Expandable Search Bar */}
      {searchBarOpen && (
        <div ref={searchRef} className="border-t bg-white px-4 py-3">
          <div className="max-w-7xl mx-auto">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                className="pl-11 pr-10 py-2.5 w-full text-base bg-gray-50 border-gray-200 rounded-full focus:bg-white transition-colors"
                data-testid="input-search"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setShowDropdown(false);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  data-testid="button-clear-search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            {/* Search Dropdown */}
            {showDropdown && (searchQuery.trim().length >= 2 || isSearching) && (
              <div className="mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
                {isSearching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <ScrollArea className="max-h-[400px]">
                    <div className="py-2">
                      {searchResults.map((product) => (
                        <button
                          key={product._id}
                          onClick={() => handleProductClick(product._id, product.baseProductId, product.name)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                          data-testid={`search-result-${product._id}`}
                        >
                          <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
                            <img
                              src={product.displayImage || "/default-saree.jpg"}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.src = '/default-saree.jpg'; }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 line-clamp-2">
                              {product.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {product.category}
                              {product.displayColor && ` - ${product.displayColor}`}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-sm font-semibold text-primary">
                                Rs. {product.price.toLocaleString('en-IN')}
                              </span>
                              {product.originalPrice && product.originalPrice > product.price && (
                                <span className="text-xs text-muted-foreground line-through">
                                  Rs. {product.originalPrice.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                ) : searchQuery.trim().length >= 2 ? (
                  <div className="py-8 px-4 text-center">
                    <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No products found for "{searchQuery}"
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Try a different search term
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Navigation Menu */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-xl font-bold">Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col h-[calc(100vh-80px)] overflow-y-auto">
            <div className="flex flex-col gap-1 p-3">
              <Link
                href="/"
                className={`text-base font-medium py-3 px-4 rounded-md hover-elevate transition-colors ${navState.isHome ? "bg-primary/10 text-primary" : "text-foreground"}`}
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-home"
              >
                HOME
              </Link>
              <Link
                href="/new-arrivals"
                className={`text-base font-medium py-3 px-4 rounded-md hover-elevate transition-colors ${navState.isNewArrivals ? "bg-primary/10 text-primary" : "text-foreground"}`}
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-new-arrivals"
              >
                NEW ARRIVALS
              </Link>
              <Link
                href="/trending-collection"
                className={`text-base font-medium py-3 px-4 rounded-md hover-elevate transition-colors ${navState.isTrending ? "bg-primary/10 text-primary" : "text-foreground"}`}
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-trending"
              >
                TRENDING COLLECTION
              </Link>
            </div>
            
            <div className="border-t">
              <Collapsible open={categoriesOpen} onOpenChange={setCategoriesOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-4 text-base font-medium hover-elevate transition-colors group">
                  <span className="text-foreground">CATEGORIES</span>
                  <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${categoriesOpen ? "rotate-90" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pb-2">
                  <div className="flex flex-col gap-1 pl-2 pr-3">
                    {categoryMenu.map((cat) => (
                      cat.subCategories.length === 0 ? (
                        <Link
                          key={cat.label}
                          href={`/products?${cat.param}`}
                          className="text-sm py-2.5 px-4 block rounded-md hover-elevate transition-colors text-muted-foreground hover:text-foreground font-medium"
                          onClick={() => setMobileMenuOpen(false)}
                          data-testid={`mobile-category-main-${cat.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {cat.label}
                        </Link>
                      ) : (
                        <Collapsible
                          key={cat.label}
                          open={openMobileSubCategory === cat.label}
                          onOpenChange={(open) => setOpenMobileSubCategory(open ? cat.label : null)}
                        >
                          <div className="flex items-center w-full rounded-md text-sm font-medium hover-elevate transition-colors text-muted-foreground hover:text-foreground">
                            <Link
                              href={`/products?${cat.param}`}
                              className="flex-1 py-2.5 px-4 text-left"
                              onClick={() => setMobileMenuOpen(false)}
                              data-testid={`mobile-category-main-${cat.label.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              {cat.label}
                            </Link>
                            <CollapsibleTrigger asChild>
                              <button className="py-2.5 px-3">
                                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openMobileSubCategory === cat.label ? "rotate-90" : ""}`} />
                              </button>
                            </CollapsibleTrigger>
                          </div>
                          <CollapsibleContent>
                            <div className="flex flex-col gap-0.5 pl-4 pr-2 pb-1">
                              {cat.subCategories.map((sub) => (
                                <Link
                                  key={sub.label}
                                  href={`/products?${sub.param}`}
                                  className="text-xs py-2 px-4 block rounded-md hover-elevate transition-colors text-muted-foreground hover:text-foreground"
                                  onClick={() => setMobileMenuOpen(false)}
                                  data-testid={`mobile-category-sub-${sub.label.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  {sub.label}
                                </Link>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="border-t flex flex-col gap-1 p-3">
              <Link
                href="/sale"
                className={`text-base font-medium py-3 px-4 block rounded-md hover-elevate transition-colors ${navState.isSale ? "bg-primary/10 text-primary" : "text-foreground"}`}
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-sale"
              >
                SALE
              </Link>
              <Link
                href="/bestseller"
                className={`text-base font-medium py-3 px-4 block rounded-md hover-elevate transition-colors ${navState.isBestSeller ? "bg-primary/10 text-primary" : "text-foreground"}`}
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-bestseller"
              >
                BEST SELLER
              </Link>
              <button
                onClick={() => {
                  handleContactClick();
                  setMobileMenuOpen(false);
                }}
                className={`text-base font-medium py-3 px-4 block rounded-md hover-elevate text-left w-full transition-colors ${navState.isContact ? "bg-primary/10 text-primary" : "text-foreground"}`}
                data-testid="mobile-link-contact"
              >
                CONTACT
              </button>
            </div>
          </nav>
        </SheetContent>
      </Sheet>

      <LoginDialog open={isLoginOpen} onOpenChange={closeLogin} />
    </header>
  );
}
