import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { motion } from "framer-motion";
import { colorPreferences } from "@/lib/colorPreferences";
import { extractUniqueColorsFromProducts, extractColorHexMapFromProducts, getSwatchColor } from "@/lib/colorUtils";

interface ApiSubCategory {
  name: string;
  slug: string;
  image: string;
  description?: string;
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

export default function Products() {
  const [location] = useLocation();
  const searchString = useSearch();
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileSort, setShowMobileSort] = useState(false);
  const [sortBy, setSortBy] = useState("");
  const [order, setOrder] = useState("");
  const [page, setPage] = useState(1);
  const [priceRange, setPriceRange] = useState([0, 10000]);
  const [priceFilterActive, setPriceFilterActive] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([]);
  const [isTrending, setIsTrending] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [mainCategoryParam, setMainCategoryParam] = useState<string>("");
  const [openSections, setOpenSections] = useState<string[]>(["categories", "price", "color"]);

  // Fetch the full category tree
  const { data: apiCategories } = useQuery<ApiCategory[]>({
    queryKey: ["/api/categories"],
  });

  // Find the active main category based on URL params
  const activeMainCategory = useMemo(() => {
    if (!apiCategories) return null;
    if (mainCategoryParam) {
      return apiCategories.find(
        (c) => c.name.toLowerCase() === mainCategoryParam.toLowerCase()
      ) || null;
    }
    // If subcategory is selected, find its parent main category
    if (selectedCategories.length > 0) {
      return apiCategories.find((c) =>
        c.subCategories.some((sub) => selectedCategories.includes(sub.name))
      ) || null;
    }
    return null;
  }, [apiCategories, mainCategoryParam, selectedCategories]);

  // Find the active single subcategory object (for description banner)
  const activeSubcategory = useMemo((): ApiSubCategory | null => {
    if (!apiCategories || selectedCategories.length !== 1) return null;
    for (const cat of apiCategories) {
      const found = cat.subCategories.find((s) => s.name === selectedCategories[0]);
      if (found) return found;
    }
    return null;
  }, [apiCategories, selectedCategories]);

  // Subcategories to show in the filter sidebar
  const filterableSubcategories = useMemo(() => {
    if (activeMainCategory && activeMainCategory.subCategories.length > 0) {
      return activeMainCategory.subCategories.map((s) => s.name);
    }
    return null; // null means "use the generic list from /api/filters"
  }, [activeMainCategory]);

  // When mainCategory is selected from URL, gather all its subcategory names
  // so we can pass them to the products API as a category filter
  const mainCategorySubcategoryNames = useMemo(() => {
    if (activeMainCategory && mainCategoryParam) {
      return activeMainCategory.subCategories.map((s) => s.name);
    }
    return [];
  }, [activeMainCategory, mainCategoryParam]);

  // Dynamic page title
  const pageTitle = useMemo(() => {
    if (searchQuery) return `Search: "${searchQuery}"`;
    if (selectedCategories.length === 1) return selectedCategories[0];
    if (selectedCategories.length > 1) return "Multiple Categories";
    if (activeMainCategory) return `All ${activeMainCategory.name.charAt(0) + activeMainCategory.name.slice(1).toLowerCase()}`;
    return "All Products";
  }, [searchQuery, selectedCategories, activeMainCategory]);

  useEffect(() => {
    const urlParams = new URLSearchParams(searchString);
    
    const mainCat = urlParams.get('mainCategory');
    setMainCategoryParam(mainCat || "");

    const categoryParam = urlParams.get('category');
    setSelectedCategories(categoryParam ? categoryParam.split(',') : []);
    
    const occasionParam = urlParams.get('occasion');
    setSelectedOccasions(occasionParam ? occasionParam.split(',') : []);
    
    const colorParam = urlParams.get('color');
    setSelectedColors(colorParam ? colorParam.split(',') : []);
    
    const fabricParam = urlParams.get('fabric');
    setSelectedFabrics(fabricParam ? fabricParam.split(',') : []);
    
    const trendingParam = urlParams.get('isTrending');
    setIsTrending(trendingParam === 'true');

    const searchParam = urlParams.get('search');
    setSearchQuery(searchParam || "");
    
    setPage(1);
    
    // Scroll to top when filters change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchString]);

  const toggleSection = (section: string) => {
    setOpenSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  // Build query params
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "12",
  });

  // Only add price filter if user has explicitly interacted with it
  if (priceFilterActive) {
    queryParams.append("minPrice", priceRange[0].toString());
    queryParams.append("maxPrice", priceRange[1].toString());
  }

  if (sortBy && order) {
    queryParams.append("sort", sortBy);
    queryParams.append("order", order);
  }

  // If a parent category is selected (no specific subcategory chosen), pass mainCategory to backend
  // which handles matching both new-style (category=SAREES) and legacy products
  if (mainCategoryParam && selectedCategories.length === 0) {
    queryParams.append("mainCategory", mainCategoryParam);
  } else if (selectedCategories.length > 0) {
    queryParams.append("category", selectedCategories.join(","));
  }
  if (selectedFabrics.length > 0) {
    queryParams.append("fabric", selectedFabrics.join(","));
  }
  if (selectedColors.length > 0) {
    queryParams.append("color", selectedColors.join(","));
  }
  if (selectedOccasions.length > 0) {
    queryParams.append("occasion", selectedOccasions.join(","));
  }
  if (isTrending) {
    queryParams.append("isTrending", "true");
  }
  if (searchQuery) {
    queryParams.append("search", searchQuery);
  }
  queryParams.append("inStock", "false");

  const { data: productsData, isLoading } = useQuery({
    queryKey: ["/api/products", queryParams.toString()],
    queryFn: async () => {
      const response = await fetch(`/api/products?${queryParams}`);
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  });

  const { data: filtersData } = useQuery<{
    categories: string[];
    fabrics: string[];
    colors: string[];
    occasions: string[];
  }>({
    queryKey: ["/api/filters"],
  });

  // Build price range query params (without page/limit/price)
  const priceRangeParams = new URLSearchParams();
  if (mainCategoryParam && selectedCategories.length === 0) {
    priceRangeParams.append("mainCategory", mainCategoryParam);
  } else if (selectedCategories.length > 0) {
    priceRangeParams.append("category", selectedCategories.join(","));
  }
  if (selectedFabrics.length > 0) {
    priceRangeParams.append("fabric", selectedFabrics.join(","));
  }
  if (selectedColors.length > 0) {
    priceRangeParams.append("color", selectedColors.join(","));
  }
  if (selectedOccasions.length > 0) {
    priceRangeParams.append("occasion", selectedOccasions.join(","));
  }
  if (isTrending) {
    priceRangeParams.append("isTrending", "true");
  }

  const { data: priceRangeData } = useQuery<{
    minPrice: number;
    maxPrice: number;
  }>({
    queryKey: [`/api/price-range?${priceRangeParams.toString()}`],
  });

  // Update price range when API data changes - reset to full range
  useEffect(() => {
    if (priceRangeData) {
      if (priceRangeData.maxPrice > 0) {
        setPriceRange([priceRangeData.minPrice, priceRangeData.maxPrice]);
      } else {
        // If no products, use fallback
        setPriceRange([0, 10000]);
      }
    }
  }, [priceRangeData]);

  const products = productsData?.products || [];
  const pagination = productsData?.pagination || { total: 0, pages: 1 };

  // Use subcategories of the active main category if available, else fall back to all DB categories
  const categories = filterableSubcategories ?? filtersData?.categories ?? ["Jamdani Paithani", "Khun / Irkal (Ilkal)", "Ajrakh Modal", "Mul Mul Cotton", "Khadi Cotton", "Patch Work", "Pure Linen"];
  const fabrics = filtersData?.fabrics || ["Silk", "Cotton", "Georgette", "Chiffon", "Net", "Crepe", "Chanderi", "Linen"];
  const occasions = filtersData?.occasions || ["Wedding", "Party", "Festival", "Casual", "Office"];
  
  const productColors = useMemo(() => {
    return extractUniqueColorsFromProducts(products);
  }, [products]);

  const colorHexMap = useMemo(() => extractColorHexMapFromProducts(products), [products]);

  const handleSortChange = (value: string) => {
    if (value === "none") {
      setSortBy("");
      setOrder("");
    } else {
      const [newSort, newOrder] = value.split("-");
      setSortBy(newSort);
      setOrder(newOrder || "desc");
    }
    setPage(1);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
    setPage(1);
  };

  const toggleFabric = (fabric: string) => {
    setSelectedFabrics(prev =>
      prev.includes(fabric) ? prev.filter(f => f !== fabric) : [...prev, fabric]
    );
    setPage(1);
  };

  const toggleColor = (color: string) => {
    setSelectedColors(prev =>
      prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
    );
    setPage(1);
  };

  const toggleOccasion = (occasion: string) => {
    setSelectedOccasions(prev =>
      prev.includes(occasion) ? prev.filter(o => o !== occasion) : [...prev, occasion]
    );
    setPage(1);
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedFabrics([]);
    setSelectedColors([]);
    setSelectedOccasions([]);
    const maxPrice = priceRangeData?.maxPrice && priceRangeData.maxPrice > 0 ? priceRangeData.maxPrice : 10000;
    setPriceRange([0, maxPrice]);
    setPriceFilterActive(false);
    setPage(1);
  };

  const activeFiltersCount = selectedCategories.length + selectedFabrics.length + selectedColors.length + selectedOccasions.length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 lg:px-3 py-8 pb-20 lg:pb-8">
        <div className="mb-6">
          <nav className="text-sm text-muted-foreground mb-4" data-testid="breadcrumb">
            <a href="/" className="hover:text-foreground">Home</a>
            {activeMainCategory && (
              <>
                <span className="mx-2">/</span>
                <a
                  href={`/products?mainCategory=${encodeURIComponent(activeMainCategory.name)}`}
                  className={`hover:text-foreground ${!selectedCategories.length ? "text-foreground" : ""}`}
                >
                  {activeMainCategory.name.charAt(0) + activeMainCategory.name.slice(1).toLowerCase()}
                </a>
              </>
            )}
            {selectedCategories.length === 1 && (
              <>
                <span className="mx-2">/</span>
                <span className="text-foreground">{selectedCategories[0]}</span>
              </>
            )}
            {!activeMainCategory && !selectedCategories.length && (
              <>
                <span className="mx-2">/</span>
                <span className="text-foreground">All Products</span>
              </>
            )}
          </nav>
          
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold mb-1" data-testid="text-page-title">
                {pageTitle}
              </h1>
              {activeSubcategory?.description && (
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed" data-testid="text-subcategory-description">
                  {activeSubcategory.description}
                </p>
              )}
              <p className="text-muted-foreground mt-1" data-testid="text-results-count">
                {pagination.variantTotal ?? pagination.total} variants
              </p>
            </div>
            
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              <Select 
                value={sortBy && order ? `${sortBy}-${order}` : "none"} 
                onValueChange={handleSortChange}
              >
                <SelectTrigger className="w-48" data-testid="select-sort">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sort By</SelectItem>
                  <SelectItem value="createdAt-desc">What's New</SelectItem>
                  <SelectItem value="rating-desc">Highest Rated</SelectItem>
                  <SelectItem value="reviewCount-desc">Most Reviews</SelectItem>
                  <SelectItem value="price-asc">Price: Low to High</SelectItem>
                  <SelectItem value="price-desc">Price: High to Low</SelectItem>
                  <SelectItem value="discount-desc">Best Discount</SelectItem>
                  <SelectItem value="name-asc">Name: A to Z</SelectItem>
                  <SelectItem value="name-desc">Name: Z to A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {selectedCategories.map(cat => (
                <Button
                  key={cat}
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleCategory(cat)}
                  data-testid={`filter-tag-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {cat} <X className="h-3 w-3 ml-1" />
                </Button>
              ))}
              {selectedFabrics.map(fab => (
                <Button
                  key={fab}
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleFabric(fab)}
                >
                  {fab} <X className="h-3 w-3 ml-1" />
                </Button>
              ))}
              {selectedColors.map(col => (
                <Button
                  key={col}
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleColor(col)}
                >
                  {col} <X className="h-3 w-3 ml-1" />
                </Button>
              ))}
              {selectedOccasions.map(occ => (
                <Button
                  key={occ}
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleOccasion(occ)}
                >
                  {occ} <X className="h-3 w-3 ml-1" />
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={clearAllFilters} data-testid="button-clear-all">
                Clear all
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-6">
          <aside className={`w-64 flex-shrink-0 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="space-y-4 p-4 bg-background rounded-md sticky top-24" data-testid="sidebar-filters">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Filters</h3>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
                    Clear All
                  </Button>
                )}
              </div>

              <Collapsible open={openSections.includes("categories")}>
                <CollapsibleTrigger 
                  className="flex items-center justify-between w-full py-2 hover-elevate px-2 rounded-md"
                  onClick={() => toggleSection("categories")}
                  data-testid="button-toggle-categories"
                >
                  <span className="font-medium">Categories</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("categories") ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {categories.map((category: string) => (
                    <div key={category} className="flex items-center space-x-2">
                      <Checkbox 
                        id={category} 
                        checked={selectedCategories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                        data-testid={`checkbox-category-${category.toLowerCase().replace(/\s+/g, '-')}`} 
                      />
                      <Label htmlFor={category} className="text-sm cursor-pointer">
                        {category}
                      </Label>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={openSections.includes("price")}>
                <CollapsibleTrigger 
                  className="flex items-center justify-between w-full py-2 hover-elevate px-2 rounded-md"
                  onClick={() => toggleSection("price")}
                  data-testid="button-toggle-price"
                >
                  <span className="font-medium">Price Range</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("price") ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <Slider
                    value={priceRange}
                    onValueChange={(val) => {
                      setPriceRange(val);
                      setPriceFilterActive(true);
                      setPage(1);
                    }}
                    min={priceRangeData?.minPrice || 0}
                    max={priceRangeData?.maxPrice || 10000}
                    step={500}
                    data-testid="slider-price-range"
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span data-testid="text-price-min">₹{priceRange[0]}</span>
                    <span data-testid="text-price-max">₹{priceRange[1]}</span>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* HIDDEN - Fabric Type Filter (Uncomment to re-enable) */}
              {/* <Collapsible open={openSections.includes("fabric")}>
                <CollapsibleTrigger 
                  className="flex items-center justify-between w-full py-2 hover-elevate px-2 rounded-md"
                  onClick={() => toggleSection("fabric")}
                  data-testid="button-toggle-fabric"
                >
                  <span className="font-medium">Fabric Type</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("fabric") ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {fabrics.map((fabric: string) => (
                    <div key={fabric} className="flex items-center space-x-2">
                      <Checkbox 
                        id={fabric} 
                        checked={selectedFabrics.includes(fabric)}
                        onCheckedChange={() => toggleFabric(fabric)}
                        data-testid={`checkbox-fabric-${fabric.toLowerCase()}`} 
                      />
                      <Label htmlFor={fabric} className="text-sm cursor-pointer">
                        {fabric}
                      </Label>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible> */}

              {/* HIDDEN - Occasion Filter (Uncomment to re-enable) */}
              {/* <Collapsible open={openSections.includes("occasion")}>
                <CollapsibleTrigger 
                  className="flex items-center justify-between w-full py-2 hover-elevate px-2 rounded-md"
                  onClick={() => toggleSection("occasion")}
                  data-testid="button-toggle-occasion"
                >
                  <span className="font-medium">Occasion</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("occasion") ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {occasions.map((occasion: string) => (
                    <div key={occasion} className="flex items-center space-x-2">
                      <Checkbox 
                        id={occasion} 
                        checked={selectedOccasions.includes(occasion)}
                        onCheckedChange={() => toggleOccasion(occasion)}
                        data-testid={`checkbox-occasion-${occasion.toLowerCase()}`} 
                      />
                      <Label htmlFor={occasion} className="text-sm cursor-pointer">
                        {occasion}
                      </Label>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible> */}

              {productColors.length > 0 && (
                <Collapsible open={openSections.includes("color")}>
                  <CollapsibleTrigger 
                    className="flex items-center justify-between w-full py-2 hover-elevate px-2 rounded-md"
                    onClick={() => toggleSection("color")}
                    data-testid="button-toggle-color"
                  >
                    <span className="font-medium">Color</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("color") ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pb-3 px-1 overflow-visible">
                    <div className="grid grid-cols-5 gap-2 overflow-visible">
                      {productColors.map((color: string) => (
                        <button
                          key={color}
                          className={`w-8 h-8 rounded-full border-2 hover-elevate overflow-visible ${
                            selectedColors.includes(color) ? 'border-primary ring-2 ring-primary ring-offset-1' : 'border-border'
                          }`}
                          style={{ backgroundColor: getSwatchColor(color, colorHexMap) }}
                          onClick={() => toggleColor(color)}
                          title={color}
                          data-testid={`button-color-${color.toLowerCase().replace(/\s+/g, '-')}`}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </aside>

          <div className="flex-1">
            {isLoading ? (
              <div className="text-center py-12">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground">No products found matching your filters.</p>
                <Button onClick={clearAllFilters} className="mt-4" data-testid="button-clear-filters-empty">
                  Clear Filters
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                  {products.map((product: any, index: number) => {
                    const discount = product.originalPrice 
                      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
                      : 0;

                    const displayImages = product.displayImages || product.images || [];

                    return (
                      <div key={product._id}>
                        <ProductCard
                          id={product._id}
                          baseProductId={product.baseProductId}
                          displayColor={product.displayColor}
                          name={product.name}
                          image={displayImages[0] || "/default-saree.jpg"}
                          secondaryImage={displayImages[1]}
                          price={product.price}
                          originalPrice={product.originalPrice}
                          discount={discount || undefined}
                          rating={product.rating}
                          reviewCount={product.reviewCount}
                          isNew={product.isNew}
                          isBestseller={product.isBestseller}
                          inStock={product.variantInStock !== undefined ? product.variantInStock !== false : product.inStock !== false}
                          context="products"
                          shortDescription={product.subDescription}
                        />
                      </div>
                    );
                  })}
                </div>

                {pagination.pages > 1 && (
                  <div className="flex justify-center mt-8 gap-2">
                    <Button 
                      variant="outline" 
                      disabled={page === 1}
                      onClick={() => {
                        setPage(p => p - 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      data-testid="button-page-prev"
                    >
                      Previous
                    </Button>
                    {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? "default" : "outline"}
                          onClick={() => {
                            setPage(pageNum);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          data-testid={`button-page-${pageNum}`}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button 
                      variant="outline" 
                      disabled={page === pagination.pages}
                      onClick={() => {
                        setPage(p => p + 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      data-testid="button-page-next"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar with Sort and Filter */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-50 safe-area-pb">
        <div className="grid grid-cols-2 gap-px">
          <Sheet open={showMobileSort} onOpenChange={setShowMobileSort}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-14 rounded-none flex items-center justify-center gap-2"
                data-testid="button-mobile-sort"
              >
                <ArrowUpDown className="h-5 w-5" />
                <span className="font-medium">SORT</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[50vh]">
              <SheetHeader>
                <SheetTitle>Sort By</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-2">
                {[
                  { value: "none", label: "Default" },
                  { value: "createdAt-desc", label: "What's New" },
                  { value: "rating-desc", label: "Highest Rated" },
                  { value: "reviewCount-desc", label: "Most Reviews" },
                  { value: "price-asc", label: "Price: Low to High" },
                  { value: "price-desc", label: "Price: High to Low" },
                  { value: "discount-desc", label: "Best Discount" },
                  { value: "name-asc", label: "Name: A to Z" },
                  { value: "name-desc", label: "Name: Z to A" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={
                      (option.value === "none" && !sortBy && !order) ||
                      (sortBy && order && `${sortBy}-${order}` === option.value)
                        ? "default"
                        : "ghost"
                    }
                    className="w-full justify-start"
                    onClick={() => {
                      handleSortChange(option.value);
                      setShowMobileSort(false);
                    }}
                    data-testid={`button-sort-${option.value}`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={showFilters} onOpenChange={setShowFilters}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-14 rounded-none flex items-center justify-center gap-2"
                data-testid="button-mobile-filter"
              >
                <SlidersHorizontal className="h-5 w-5" />
                <span className="font-medium">FILTER</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
              <SheetHeader className="mb-4 pr-8">
                <div className="flex items-center justify-between">
                  <SheetTitle>Filters</SheetTitle>
                  {activeFiltersCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="mr-6">
                      Clear All
                    </Button>
                  )}
                </div>
              </SheetHeader>
              
              <div className="space-y-6">
                <Collapsible open={openSections.includes("categories")}>
                  <CollapsibleTrigger 
                    className="flex items-center justify-between w-full py-3 hover-elevate px-2 rounded-md"
                    onClick={() => toggleSection("categories")}
                  >
                    <span className="font-medium">Categories</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("categories") ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    {categories.map((category: string) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`mobile-${category}`} 
                          checked={selectedCategories.includes(category)}
                          onCheckedChange={() => toggleCategory(category)}
                        />
                        <Label htmlFor={`mobile-${category}`} className="text-sm cursor-pointer">
                          {category}
                        </Label>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={openSections.includes("price")}>
                  <CollapsibleTrigger 
                    className="flex items-center justify-between w-full py-3 hover-elevate px-2 rounded-md"
                    onClick={() => toggleSection("price")}
                  >
                    <span className="font-medium">Price Range</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("price") ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4 space-y-4">
                    <Slider
                      value={priceRange}
                      onValueChange={(val) => {
                        setPriceRange(val);
                        setPriceFilterActive(true);
                        setPage(1);
                      }}
                      min={priceRangeData?.minPrice || 0}
                      max={priceRangeData?.maxPrice || 10000}
                      step={100}
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span>₹{priceRange[0]}</span>
                      <span>₹{priceRange[1]}</span>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* HIDDEN - Fabric Type Filter (Uncomment to re-enable) */}
                {/* <Collapsible open={openSections.includes("fabric")}>
                  <CollapsibleTrigger 
                    className="flex items-center justify-between w-full py-3 hover-elevate px-2 rounded-md"
                    onClick={() => toggleSection("fabric")}
                  >
                    <span className="font-medium">Fabric Type</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("fabric") ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    {fabrics.map((fabric: string) => (
                      <div key={fabric} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`mobile-${fabric}`} 
                          checked={selectedFabrics.includes(fabric)}
                          onCheckedChange={() => toggleFabric(fabric)}
                        />
                        <Label htmlFor={`mobile-${fabric}`} className="text-sm cursor-pointer">
                          {fabric}
                        </Label>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible> */}

                {/* HIDDEN - Occasion Filter (Uncomment to re-enable) */}
                {/* <Collapsible open={openSections.includes("occasion")}>
                  <CollapsibleTrigger 
                    className="flex items-center justify-between w-full py-3 hover-elevate px-2 rounded-md"
                    onClick={() => toggleSection("occasion")}
                  >
                    <span className="font-medium">Occasion</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("occasion") ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    {occasions.map((occasion: string) => (
                      <div key={occasion} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`mobile-${occasion}`} 
                          checked={selectedOccasions.includes(occasion)}
                          onCheckedChange={() => toggleOccasion(occasion)}
                        />
                        <Label htmlFor={`mobile-${occasion}`} className="text-sm cursor-pointer">
                          {occasion}
                        </Label>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible> */}

                {productColors.length > 0 && (
                  <Collapsible open={openSections.includes("color")}>
                    <CollapsibleTrigger 
                      className="flex items-center justify-between w-full py-3 hover-elevate px-2 rounded-md"
                      onClick={() => toggleSection("color")}
                    >
                      <span className="font-medium">Color</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${openSections.includes("color") ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="grid grid-cols-5 gap-3">
                        {productColors.map((color: string) => (
                          <button
                            key={color}
                            className={`w-10 h-10 rounded-full border-2 hover-elevate ${
                              selectedColors.includes(color) ? 'border-primary ring-2 ring-primary ring-offset-1' : 'border-border'
                            }`}
                            style={{ backgroundColor: getSwatchColor(color, colorHexMap) }}
                            onClick={() => toggleColor(color)}
                            title={color}
                            data-testid={`button-mobile-color-${color.toLowerCase().replace(/\s+/g, '-')}`}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Footer />
    </div>
  );
}
