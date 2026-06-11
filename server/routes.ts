import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { connectDB } from "./db";
import { Product, User, Customer, Cart, Wishlist, Order, Address, ContactSubmission, OTP, Review, HeroBanner, Settings, AdminUser, Category, AnnouncementBar } from "./models";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";
import { upload, mediaUpload } from "./upload-config";
import { saveImageLocally, deleteLocalImages, extractProductImageUrls, extractCategoryImageUrls } from "./cloudinary-service";
import { sendSMSOTP, generateOTP, sendOrderConfirmationSMS, sendPaymentFailureSMS, sendOrderAcceptedSMS, sendOrderCancelledSMS, sendOrderShippedSMS, sendOrderDeliveredSMS } from "./sms-service";
import { sendOrderConfirmation } from "./whatsapp-service";
import { sendNewOrderEmail } from "./email-service";
import { phonePeService } from "./phonepe-service";
import { shiprocketService } from "./shiprocket.service";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      admin?: any;
    }
  }
}

const JWT_SECRET = process.env.SESSION_SECRET || "ramani-fashion-secret-key";
const ADMIN_JWT_SECRET = process.env.ADMIN_SESSION_SECRET || "ramani-admin-secret-key-2024";

// Middleware to verify JWT token
function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Middleware to verify admin JWT token
function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  jwt.verify(token, ADMIN_JWT_SECRET, (err: any, admin: any) => {
    if (err) return res.status(403).json({ error: 'Invalid admin token' });
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = admin;
    next();
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Connect to MongoDB
  await connectDB();

  // ── Category Routes ──────────────────────────────────────────
  // GET all active categories (with full sub-category tree)
  app.get("/api/categories", async (_req, res) => {
    try {
      const categories = await Category.find({ isActive: true }).sort({ order: 1 });
      res.json(categories);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // GET a single category by slug
  app.get("/api/categories/:slug", async (req, res) => {
    try {
      const category = await Category.findOne({ slug: req.params.slug, isActive: true });
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch category" });
    }
  });

  // POST create a category (admin)
  app.post("/api/admin/categories", authenticateAdmin, async (req, res) => {
    try {
      const category = await Category.create(req.body);
      res.status(201).json(category);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // PUT update a category (admin)
  app.put("/api/admin/categories/:id", authenticateAdmin, async (req, res) => {
    try {
      const category = await Category.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true }
      );
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE a category (admin)
  app.delete("/api/admin/categories/:id", authenticateAdmin, async (req, res) => {
    try {
      const category = await Category.findById(req.params.id);
      if (category) {
        deleteLocalImages(extractCategoryImageUrls(category));
        // Collect all subcategory names under this parent category
        const subNames: string[] = Array.isArray(category.subCategories)
          ? (category.subCategories as any[]).map((s: any) => s.name).filter(Boolean)
          : [];
        // Clear subcategory field on products assigned to any of those subcategories
        if (subNames.length > 0) {
          await Product.updateMany(
            { subcategory: { $in: subNames } },
            { $unset: { subcategory: "" } }
          );
        }
        // Clear subcategory field on products directly assigned to this parent category name
        await Product.updateMany(
          { category: category.name },
          { $unset: { subcategory: "" } }
        );
      }
      await Category.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // POST upload image for a main category
  app.post("/api/admin/categories/:id/upload-image", authenticateAdmin, (req, res) => {
    upload.single("image")(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(500).json({ error: "Upload failed" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      try {
        const existingCategory = await Category.findById(req.params.id);
        const oldUrl = existingCategory?.image || "";
        const url = await saveImageLocally(req.file.buffer, req.file.originalname, oldUrl);
        const category = await Category.findByIdAndUpdate(
          req.params.id,
          { image: url, updatedAt: new Date() },
          { new: true }
        );
        if (!category) return res.status(404).json({ error: "Category not found" });
        res.json({ success: true, image: url, category });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  // POST add a subcategory to a main category (with optional image upload)
  app.post("/api/admin/categories/:id/subcategories", authenticateAdmin, (req, res) => {
    upload.single("image")(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(500).json({ error: "Upload failed" });
      try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Subcategory name is required" });
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        let imageUrl = "";
        if (req.file) {
          imageUrl = await saveImageLocally(req.file.buffer, req.file.originalname);
        }

        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ error: "Category not found" });
        const subs: any[] = Array.isArray(category.subCategories) ? [...category.subCategories] : [];
        if (subs.some((s: any) => s.slug === slug)) {
          return res.status(400).json({ error: "Subcategory with this name already exists" });
        }
        subs.push({ name, slug, image: imageUrl, subCategories: [] });
        category.subCategories = subs;
        category.markModified('subCategories');
        category.updatedAt = new Date();
        await category.save();
        res.json({ success: true, category });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  // PUT edit a subcategory (name and/or image)
  app.put("/api/admin/categories/:id/subcategories/:subSlug", authenticateAdmin, (req, res) => {
    upload.single("image")(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(500).json({ error: "Upload failed" });
      try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ error: "Category not found" });
        const subs: any[] = Array.isArray(category.subCategories) ? [...category.subCategories] : [];
        const idx = subs.findIndex((s: any) => s.slug === req.params.subSlug);
        if (idx === -1) return res.status(404).json({ error: "Subcategory not found" });
        const { name, description } = req.body;
        if (name) {
          subs[idx].name = name;
          subs[idx].slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        }
        if (description !== undefined) {
          subs[idx].description = description;
        }
        if (req.file) {
          const oldSubUrl = subs[idx].image || "";
          subs[idx].image = await saveImageLocally(req.file.buffer, req.file.originalname, oldSubUrl);
        }
        category.subCategories = subs;
        category.markModified('subCategories');
        category.updatedAt = new Date();
        await category.save();
        res.json({ success: true, category });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  // DELETE a subcategory from a main category
  app.delete("/api/admin/categories/:id/subcategories/:subSlug", authenticateAdmin, async (req, res) => {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) return res.status(404).json({ error: "Category not found" });
      const subs: any[] = Array.isArray(category.subCategories) ? [...category.subCategories] : [];
      const deletedSub = subs.find((s: any) => s.slug === req.params.subSlug);
      if (!deletedSub) return res.status(404).json({ error: "Subcategory not found" });
      const filtered = subs.filter((s: any) => s.slug !== req.params.subSlug);
      category.subCategories = filtered;
      category.markModified('subCategories');
      category.updatedAt = new Date();
      await category.save();
      // Clear subcategory field from all products assigned to the deleted subcategory
      if (deletedSub.name) {
        await Product.updateMany(
          { subcategory: deletedSub.name },
          { $unset: { subcategory: "" } }
        );
      }
      res.json({ success: true, category });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Product Routes
  app.get("/api/products", async (req, res) => {
    try {
      const {
        category,
        mainCategory,
        fabric,
        color,
        occasion,
        minPrice,
        maxPrice,
        inStock,
        search,
        sort = 'updatedAt',
        order = 'desc',
        page = '1',
        limit = '12',
        onSale
      } = req.query;

      const query: any = {};
      const addPriceRangeAndCondition = (condition: any) => {
        if (!query.$and) query.$and = [];
        query.$and.push(condition);
      };
      const addAndCondition = (condition: any) => {
        if (!query.$and) query.$and = [];
        query.$and.push(condition);
      };

      // mainCategory: filter by parent category, matching both new (category=SAREES) and legacy (category=subcategory name) products
      if (mainCategory) {
        const mainCatName = (mainCategory as string).trim();
        // Find the parent category document to get all subcategory names
        const catDoc = await Category.findOne({ name: { $regex: new RegExp(`^${mainCatName}$`, 'i') } });
        const subNames = catDoc?.subCategories?.map((s: any) => s.name) || [];
        // Match: products whose category = main category name OR whose category = one of its subcategory names (legacy data)
        const orConditions: any[] = [{ category: catDoc?.name || mainCatName }];
        if (subNames.length > 0) {
          orConditions.push({ category: { $in: subNames } });
        }
        query.$or = orConditions;
      }
      // Handle multi-select category filters (comma-separated values) — only when no mainCategory
      // Uses $or to match both: legacy products (subcategory stored in category field) and
      // new products (main category in category field, subcategory in subcategory field)
      else if (category) {
        const categories = (category as string).split(',').filter(Boolean);
        const catValues = categories.length > 1 ? categories : categories[0];
        query.$or = [
          { category: typeof catValues === 'string' ? catValues : { $in: catValues } },
          { subcategory: typeof catValues === 'string' ? catValues : { $in: catValues } },
        ];
      }
      if (fabric) {
        const fabrics = (fabric as string).split(',').filter(Boolean);
        query.fabric = fabrics.length > 1 ? { $in: fabrics } : fabrics[0];
      }
      if (color) {
        const colors = (color as string).split(',').filter(Boolean);
        query['colorVariants.color'] = colors.length > 1 ? { $in: colors } : colors[0];
      }
      if (occasion) {
        const occasions = (occasion as string).split(',').filter(Boolean);
        query.occasion = occasions.length > 1 ? { $in: occasions } : occasions[0];
      }
      
      if (inStock === 'false') { /* show all */ } else { query.inStock = true; }
      if (req.query.isNew === 'true') addAndCondition({ $or: [{ 'colorVariants.isNew': true }, { category: 'JEWELLERY', isNew: true }] });
      if (req.query.isBestseller === 'true') addAndCondition({ $or: [{ 'colorVariants.isBestseller': true }, { category: 'JEWELLERY', isBestseller: true }] });
      if (req.query.isTrending === 'true') addAndCondition({ $or: [{ 'colorVariants.isTrending': true }, { category: 'JEWELLERY', isTrending: true }] });
      
      // Filter for sale products
      if (onSale === 'true') {
        query.onSale = true;
      }
      
      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
      }
      if (search) {
        query.$text = { $search: search as string };
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const sortOrder = order === 'asc' ? 1 : -1;

      // Special handling for discount sorting - use aggregation
      if (sort === 'discount') {
        // Parse color filter if present for pipeline
        let selectedColors: string[] = [];
        if (color) {
          selectedColors = (color as string).split(',').filter(Boolean);
        }

        const pipeline: any[] = [
          { $match: query },
          {
            $addFields: {
              discountPercent: {
                $cond: {
                  if: { $and: [
                    { $gt: ['$originalPrice', 0] },
                    { $ne: ['$originalPrice', null] }
                  ]},
                  then: {
                    $multiply: [
                      { $divide: [
                        { $subtract: ['$originalPrice', '$price'] },
                        '$originalPrice'
                      ]},
                      100
                    ]
                  },
                  else: 0
                }
              }
            }
          },
          // Filter colorVariants array if color filter is applied
          ...(selectedColors.length > 0 ? [{
            $addFields: {
              colorVariants: {
                $filter: {
                  input: '$colorVariants',
                  as: 'variant',
                  cond: { $in: ['$$variant.color', selectedColors] }
                }
              }
            }
          }] : []),
          { $sort: { discountPercent: sortOrder } },
          { $skip: skip },
          { $limit: limitNum }
        ];

        const products = await Product.aggregate(pipeline);
        const total = await Product.countDocuments(query);

        // Flatten products with color variants into separate cards
        const flagFilter = req.query.isNew === 'true' ? 'isNew' : req.query.isBestseller === 'true' ? 'isBestseller' : req.query.isTrending === 'true' ? 'isTrending' : null;
        const flattenedProducts = products.flatMap((product: any) => {
          if (product.colorVariants && product.colorVariants.length > 0) {
            let variants = product.colorVariants.filter((v: any) => v.isActive !== false);
            if (flagFilter) {
              const filtered = variants.filter((v: any) =>
                v[flagFilter] === true
              );
              if (filtered.length > 0 || product.category !== 'JEWELLERY' || product[flagFilter] !== true) variants = filtered;
            }
            if (variants.length === 0) return [];
            return variants.map((variant: any) => {
              const variantIndex = product.colorVariants.indexOf(variant);
              return {
                ...product,
                _id: `${product._id}_variant_${variantIndex}`,
                baseProductId: product._id,
                variantIndex: variantIndex,
                displayColor: variant.color,
                displayColorHex: variant.colorHex || '',
                displayImages: variant.images && variant.images.length > 0 ? variant.images : product.images,
                variantStockQuantity: variant.stockQuantity,
                variantInStock: variant.inStock,
                isNew: variant.isNew === true || (product.category === 'JEWELLERY' && product.isNew === true),
                isBestseller: variant.isBestseller === true || (product.category === 'JEWELLERY' && product.isBestseller === true),
                isTrending: variant.isTrending === true || (product.category === 'JEWELLERY' && product.isTrending === true),
              };
            });
          }
          return [product];
        });

        res.json({
          products: flattenedProducts,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            variantTotal: flattenedProducts.length,
            pages: Math.ceil(total / limitNum)
          }
        });
      } else {
        // Normal sorting for other fields
        const sortObj: any = {};
        sortObj[sort as string] = sortOrder;

        // Parse color filter if present for aggregation
        let selectedColors: string[] = [];
        if (color) {
          selectedColors = (color as string).split(',').filter(Boolean);
        }

        // Build aggregation pipeline with color variant filtering
        const aggregationPipeline: any[] = [
          { $match: query },
          // Filter colorVariants array if color filter is applied
          ...(selectedColors.length > 0 ? [{
            $addFields: {
              colorVariants: {
                $filter: {
                  input: '$colorVariants',
                  as: 'variant',
                  cond: { $in: ['$$variant.color', selectedColors] }
                }
              }
            }
          }] : []),
          { $sort: sortObj },
          { $skip: skip },
          { $limit: limitNum }
        ];

        const products = await Product.aggregate(aggregationPipeline).exec();

        const total = await Product.countDocuments(query);

        // Flatten products with color variants into separate cards
        const flagFilter2 = req.query.isNew === 'true' ? 'isNew' : req.query.isBestseller === 'true' ? 'isBestseller' : req.query.isTrending === 'true' ? 'isTrending' : null;
        const flattenedProducts = products.flatMap((product: any) => {
          if (product.colorVariants && product.colorVariants.length > 0) {
            let variants = product.colorVariants.filter((v: any) => v.isActive !== false);
            if (flagFilter2) {
              const filtered = variants.filter((v: any) =>
                v[flagFilter2] === true
              );
              if (filtered.length > 0 || product.category !== 'JEWELLERY' || product[flagFilter2] !== true) variants = filtered;
            }
            if (variants.length === 0) return [];
            return variants.map((variant: any) => {
              const variantIndex = product.colorVariants.indexOf(variant);
              return {
                ...product,
                _id: `${product._id}_variant_${variantIndex}`,
                baseProductId: product._id,
                variantIndex: variantIndex,
                displayColor: variant.color,
                displayColorHex: variant.colorHex || '',
                displayImages: variant.images && variant.images.length > 0 ? variant.images : product.images,
                variantStockQuantity: variant.stockQuantity,
                variantInStock: variant.inStock,
                isNew: variant.isNew === true || (product.category === 'JEWELLERY' && product.isNew === true),
                isBestseller: variant.isBestseller === true || (product.category === 'JEWELLERY' && product.isBestseller === true),
                isTrending: variant.isTrending === true || (product.category === 'JEWELLERY' && product.isTrending === true),
              };
            });
          }
          return [product];
        });

        res.json({
          products: flattenedProducts,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            variantTotal: flattenedProducts.length,
            pages: Math.ceil(total / limitNum)
          }
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      let productId = req.params.id;
      
      // Handle variant IDs (format: baseProductId_variant_index)
      if (productId.includes('_variant_')) {
        const parts = productId.split('_variant_');
        productId = parts[0]; // Extract the base product ID
      }
      
      const product = await Product.findById(productId).lean();
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // NOTE: Product mutations (create/update/delete) are now exclusively handled 
  // through the /api/admin/products endpoints with admin authentication.
  // Public access to products is read-only via GET /api/products and GET /api/products/:id

  // Quick Search endpoint for header dropdown
  app.get("/api/search", async (req, res) => {
    try {
      const { q, limit = '8' } = req.query;
      
      if (!q || (q as string).trim().length < 2) {
        return res.json({ products: [] });
      }

      const searchTerm = (q as string).trim();
      const limitNum = Math.min(parseInt(limit as string), 20);

      // Search using regex for partial matches on name, category, and description
      const searchRegex = new RegExp(searchTerm, 'i');
      
      const products = await Product.find({
        $or: [
          { name: searchRegex },
          { category: searchRegex },
          { description: searchRegex },
          { fabric: searchRegex },
          { occasion: searchRegex }
        ]
      })
        .select('name price originalPrice images category colorVariants onSale')
        .limit(limitNum)
        .lean();

      // Flatten products with color variants - show ALL active color variants in search
      const flattenedProducts = products.flatMap((product: any) => {
        if (product.colorVariants && product.colorVariants.length > 0) {
          return product.colorVariants.filter((v: any) => v.isActive !== false).map((variant: any, index: number) => ({
            _id: `${product._id}_variant_${index}`,
            baseProductId: product._id,
            name: product.name,
            variantName: `${product.name} - ${variant.color}`,
            price: product.price,
            originalPrice: product.originalPrice,
            category: product.category,
            onSale: product.onSale,
            displayColor: variant.color,
            displayImage: variant.images?.[0] || product.images?.[0] || '',
          }));
        }
        return [{
          _id: product._id,
          baseProductId: product._id,
          name: product.name,
          variantName: product.name,
          price: product.price,
          originalPrice: product.originalPrice,
          category: product.category,
          onSale: product.onSale,
          displayImage: product.images?.[0] || '',
        }];
      });

      res.json({ products: flattenedProducts.slice(0, limitNum) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Review Routes
  app.get("/api/reviews/homepage", async (req, res) => {
    try {
      const allReviews = await Review.find({}).select('rating').lean();
      const totalReviews = allReviews.length;
      const overall = totalReviews > 0
        ? allReviews.reduce((s: number, r: any) => s + r.rating, 0) / totalReviews
        : 0;
      const breakdown = [5, 4, 3, 2, 1].map(stars => {
        const count = allReviews.filter((r: any) => r.rating === stars).length;
        return { stars, count, percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0 };
      });

      const reviews = await Review.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('productId', 'name images')
        .lean();

      const customerPhotos = reviews
        .filter((r: any) => r.photos && r.photos.length > 0)
        .flatMap((r: any) => r.photos)
        .slice(0, 12);

      res.json({
        reviews,
        stats: {
          overall: Math.round(overall * 10) / 10,
          totalReviews,
          totalRatings: totalReviews,
          breakdown,
        },
        customerPhotos,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reviews/:productId", async (req, res) => {
    try {
      const { productId } = req.params;
      const { page = '1', limit = '10', sort = 'createdAt', order = 'desc' } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;
      
      const sortOrder = order === 'asc' ? 1 : -1;
      const sortField = sort === 'rating' ? 'rating' : sort === 'helpful' ? 'helpful' : 'createdAt';
      
      const reviews = await Review.find({ productId })
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      const total = await Review.countDocuments({ productId });
      
      // Calculate rating distribution by fetching all reviews for this product
      const allReviews = await Review.find({ productId }).select('rating').lean();
      
      const distribution = {
        5: 0, 4: 0, 3: 0, 2: 0, 1: 0
      };
      
      allReviews.forEach((review: any) => {
        const rating = review.rating;
        if (rating >= 1 && rating <= 5) {
          distribution[rating as keyof typeof distribution]++;
        }
      });
      
      res.json({
        reviews,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        },
        ratingDistribution: distribution
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reviews", authenticateToken, async (req, res) => {
    try {
      const { productId, rating, title, comment } = req.body;
      const customerId = req.user.userId;
      
      // Verify this is a customer token (not admin)
      if (req.user.type !== 'customer') {
        return res.status(403).json({ error: 'Only registered customers can post reviews' });
      }
      
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(403).json({ error: 'Customer account not found' });
      }
      
      if (!productId || !rating || !title || !comment) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }
      
      // Check if product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Check if customer already reviewed this product
      const existingReview = await Review.findOne({ productId, customerId });
      if (existingReview) {
        return res.status(400).json({ error: 'You have already reviewed this product' });
      }
      
      // Check if customer purchased this product (using correct field: orderStatus)
      const hasPurchased = await Order.findOne({
        userId: customerId,
        'items.productId': productId,
        orderStatus: { $in: ['delivered'] }
      });
      
      const { photos } = req.body;
      const review = new Review({
        productId,
        customerId,
        customerName: customer.name || 'Anonymous',
        rating,
        title,
        comment,
        verifiedPurchase: !!hasPurchased,
        photos: Array.isArray(photos) ? photos : [],
      });
      
      await review.save();
      
      res.status(201).json(review);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reviews/upload-image", authenticateToken, (req, res) => {
    if (req.user.type !== 'customer') {
      return res.status(403).json({ error: 'Only customers can upload review images' });
    }
    upload.single("image")(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });
        const url = await saveImageLocally(req.file.buffer, req.file.originalname);
        res.json({ url });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  app.put("/api/reviews/:reviewId/helpful", authenticateToken, async (req, res) => {
    try {
      const { reviewId } = req.params;
      const customerId = req.user.userId;
      
      // Verify this is a customer token (not admin)
      if (req.user.type !== 'customer') {
        return res.status(403).json({ error: 'Only registered customers can vote' });
      }
      
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(403).json({ error: 'Customer account not found' });
      }
      
      const review = await Review.findById(reviewId);
      if (!review) {
        return res.status(404).json({ error: 'Review not found' });
      }
      
      // Check if customer already voted (convert ObjectIds to strings for comparison)
      const hasVoted = review.helpfulVotes && review.helpfulVotes.some(
        (voterId: any) => voterId.toString() === customerId.toString()
      );
      if (hasVoted) {
        return res.status(400).json({ error: 'You have already marked this review as helpful' });
      }
      
      // Add customer to helpful votes and increment counter
      review.helpfulVotes = review.helpfulVotes || [];
      review.helpfulVotes.push(customerId);
      review.helpful = review.helpfulVotes.length;
      await review.save();
      
      res.json(review);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password, phone } = req.body;

      // Check if OTP was verified for this phone number
      const verifiedOtp = await OTP.findOne({ 
        phone, 
        verified: true,
        expiresAt: { $gt: new Date() }
      });

      if (!verifiedOtp) {
        return res.status(400).json({ error: 'Please verify your mobile number with OTP first' });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        name,
        email,
        password: hashedPassword,
        phone,
        phoneVerified: true
      });

      await user.save();

      // Clean up the used OTP
      await OTP.deleteOne({ _id: verifiedOtp._id });

      const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET);
      res.status(201).json({
        token,
        user: { id: user._id, name: user.name, email: user.email }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, phone } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if phone verification is required
      if (!user.phoneVerified) {
        if (!phone) {
          return res.status(400).json({ error: 'Please provide your mobile number and verify with OTP' });
        }

        // Verify that the provided phone matches the user's stored phone
        if (phone !== user.phone) {
          return res.status(400).json({ error: 'Phone number does not match your account' });
        }

        // Check if OTP was verified for this phone number
        const verifiedOtp = await OTP.findOne({ 
          phone, 
          verified: true,
          expiresAt: { $gt: new Date() }
        });

        if (!verifiedOtp) {
          return res.status(400).json({ error: 'Please verify your mobile number with OTP first' });
        }

        // Update user's phone verification status
        user.phoneVerified = true;
        await user.save();

        // Clean up the used OTP
        await OTP.deleteOne({ _id: verifiedOtp._id });
      }

      const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET);
      res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // OTP Routes (WhatsApp Integration)
  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Delete any existing OTP for this phone number
      await OTP.deleteMany({ phone });

      // Generate random 6-digit OTP
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Save OTP to database
      const otp = new OTP({
        phone,
        otp: otpCode,
        expiresAt
      });

      await otp.save();

      // Send OTP via SMS
      try {
        await sendSMSOTP(phone, otpCode);

        res.json({ 
          message: 'OTP sent successfully via SMS'
        });
      } catch (smsError: any) {
        console.error('SMS sending failed:', smsError);
        // Delete the saved OTP since sending failed
        await OTP.deleteOne({ _id: otp._id });
        
        return res.status(500).json({ 
          error: 'Failed to send OTP via SMS. Please try again.' 
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { phone, otp, notifyUpdates } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone number and OTP are required' });
      }

      const otpRecord = await OTP.findOne({ phone, otp });

      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }

      if (new Date() > otpRecord.expiresAt) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(400).json({ error: 'OTP expired' });
      }

      // Check if customer exists
      let customer = await Customer.findOne({ phone });
      
      if (!customer) {
        // Auto-create new customer
        customer = new Customer({
          phone,
          phoneVerified: true,
          notifyUpdates: notifyUpdates || false,
          lastLogin: new Date(),
        });
        await customer.save();
      } else {
        // Update existing customer verification status and last login
        customer.phoneVerified = true;
        customer.lastLogin = new Date();
        if (notifyUpdates !== undefined) {
          customer.notifyUpdates = notifyUpdates;
        }
        await customer.save();
      }

      // Clean up the used OTP
      await OTP.deleteOne({ _id: otpRecord._id });

      // Generate JWT token for customer
      const token = jwt.sign({ 
        userId: customer._id, 
        phone: customer.phone,
        type: 'customer'
      }, JWT_SECRET);

      res.json({ 
        message: 'OTP verified successfully', 
        verified: true,
        token,
        customer: { 
          id: customer._id, 
          phone: customer.phone,
          name: customer.name,
          email: customer.email
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const userType = (req as any).user.type || 'user';
      
      if (userType === 'customer') {
        const customer = await Customer.findById((req as any).user.userId);
        if (!customer) {
          return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(customer);
      } else {
        const user = await User.findById((req as any).user.userId).select('-password');
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/customer/profile", authenticateToken, async (req, res) => {
    try {
      const userType = (req as any).user.type;
      
      if (userType !== 'customer') {
        return res.status(403).json({ error: 'Only customers can update their profile' });
      }

      const { name, email, dob, address } = req.body;
      const customerId = (req as any).user.userId;

      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Update optional fields
      if (name !== undefined) customer.name = name;
      if (email !== undefined) customer.email = email;
      if (dob !== undefined) customer.dob = dob ? new Date(dob) : undefined;
      if (address !== undefined) {
        customer.address = {
          street: address.street || customer.address?.street,
          city: address.city || customer.address?.city,
          state: address.state || customer.address?.state,
          pincode: address.pincode || customer.address?.pincode,
          landmark: address.landmark || customer.address?.landmark,
        };
      }

      customer.updatedAt = new Date();
      await customer.save();

      res.json({
        message: 'Profile updated successfully',
        customer: {
          id: customer._id,
          phone: customer.phone,
          name: customer.name,
          email: customer.email,
          dob: customer.dob,
          address: customer.address,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cart Routes
  app.get("/api/cart", authenticateToken, async (req, res) => {
    try {
      const cart = await Cart.findOne({ userId: (req as any).user.userId })
        .populate('items.productId')
        .lean();
      
      if (!cart) {
        return res.json({ items: [] });
      }
      
      const cartWithColors = {
        ...cart,
        items: (cart as any).items.map((item: any) => ({
          ...item,
          selectedColor: item.selectedColor ?? null
        }))
      };
      
      res.json(cartWithColors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cart", authenticateToken, async (req, res) => {
    try {
      const { productId, quantity = 1, selectedColor, selectedSize } = req.body;
      const userId = (req as any).user.userId;

      const product = await Product.findById(productId).lean();
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      let availableStock: number;
      if (selectedSize && (product as any).category === 'BLOUSES') {
        // For blouse products with sizes, check size-specific stock from the matched color variant first
        const matchedVariant = selectedColor
          ? (product as any).colorVariants?.find((v: any) => v.color === selectedColor)
          : (product as any).colorVariants?.[0];
        const variantBlouseSizes = matchedVariant?.blouseSizes?.length
          ? matchedVariant.blouseSizes
          : ((product as any).blouseSizes || []);
        const sizeEntry = variantBlouseSizes.find((s: any) => s.size === selectedSize);
        availableStock = sizeEntry?.stockQuantity ?? 0;
      } else if (selectedColor && (product as any).colorVariants?.length > 0) {
        const variant = (product as any).colorVariants.find((v: any) => v.color === selectedColor);
        availableStock = variant?.stockQuantity ?? 0;
      } else {
        availableStock = (product as any).stockQuantity ?? 0;
      }

      let cart = await Cart.findOne({ userId });
      
      if (!cart) {
        cart = new Cart({ userId, items: [] });
      }

      const existingItem = cart.items.find(
        (item: any) => {
          const productMatch = item.productId.toString() === productId;
          const colorMatch = (item.selectedColor || null) === (selectedColor || null);
          const sizeMatch = (item.selectedSize || null) === (selectedSize || null);
          return productMatch && colorMatch && sizeMatch;
        }
      );

      const currentQty = existingItem ? (existingItem as any).quantity : 0;
      const newQty = currentQty + quantity;

      if (newQty > availableStock) {
        return res.status(400).json({ 
          error: `Only ${availableStock} unit(s) available in stock`,
          availableStock
        });
      }

      if (existingItem) {
        (existingItem as any).quantity = newQty;
      } else {
        cart.items.push({ productId, quantity, selectedColor: selectedColor || null, selectedSize: selectedSize || null } as any);
      }

      cart.updatedAt = new Date();
      await cart.save();

      const populatedCart = await Cart.findById(cart._id).populate('items.productId');
      res.json(populatedCart);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/cart/:productId", authenticateToken, async (req, res) => {
    try {
      const { quantity, selectedColor, selectedSize } = req.body;
      const userId = (req as any).user.userId;
      const { productId } = req.params;

      const product = await Product.findById(productId).lean();
      if (product) {
        let availableStock: number;
        if (selectedSize && (product as any).category === 'BLOUSES') {
          const matchedVariant = selectedColor
            ? (product as any).colorVariants?.find((v: any) => v.color === selectedColor)
            : (product as any).colorVariants?.[0];
          const variantBlouseSizes = matchedVariant?.blouseSizes?.length
            ? matchedVariant.blouseSizes
            : ((product as any).blouseSizes || []);
          const sizeEntry = variantBlouseSizes.find((s: any) => s.size === selectedSize);
          availableStock = sizeEntry?.stockQuantity ?? 0;
        } else if (selectedColor && (product as any).colorVariants?.length > 0) {
          const variant = (product as any).colorVariants.find((v: any) => v.color === selectedColor);
          availableStock = variant?.stockQuantity ?? 0;
        } else {
          availableStock = (product as any).stockQuantity ?? 0;
        }
        if (quantity > availableStock) {
          return res.status(400).json({ 
            error: `Only ${availableStock} unit(s) available in stock`,
            availableStock
          });
        }
      }

      const cart = await Cart.findOne({ userId });
      if (!cart) {
        return res.status(404).json({ error: 'Cart not found' });
      }

      const item = cart.items.find(
        (item: any) => {
          const productMatch = item.productId.toString() === productId;
          const colorMatch = (item.selectedColor || null) === (selectedColor || null);
          const sizeMatch = (item.selectedSize || null) === (selectedSize || null);
          return productMatch && colorMatch && sizeMatch;
        }
      );

      if (!item) {
        return res.status(404).json({ error: 'Item not found in cart' });
      }

      item.quantity = quantity;
      cart.updatedAt = new Date();
      await cart.save();

      const populatedCart = await Cart.findById(cart._id).populate('items.productId');
      res.json(populatedCart);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/cart/:productId", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { productId } = req.params;
      const { selectedColor, selectedSize } = req.body;

      const cart = await Cart.findOne({ userId });
      if (!cart) {
        return res.status(404).json({ error: 'Cart not found' });
      }

      cart.items = cart.items.filter(
        (item: any) => {
          const productMatch = item.productId.toString() === productId;
          const colorMatch = (item.selectedColor || null) === (selectedColor || null);
          const sizeMatch = (item.selectedSize || null) === (selectedSize || null);
          return !(productMatch && colorMatch && sizeMatch);
        }
      );
      cart.updatedAt = new Date();
      await cart.save();

      const populatedCart = await Cart.findById(cart._id).populate('items.productId');
      res.json(populatedCart);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Wishlist Routes
  app.get("/api/wishlist", authenticateToken, async (req, res) => {
    try {
      const wishlist = await Wishlist.findOne({ userId: (req as any).user.userId })
        .populate('items.productId')
        .lean();
      if (!wishlist) return res.json({ products: [] });
      const products = (wishlist as any).items
        .filter((item: any) => item.productId)
        .map((item: any) => {
          const p = item.productId as any;
          const selectedColor = item.selectedColor || null;
          const colorVariant = selectedColor
            ? p.colorVariants?.find((v: any) => v.color === selectedColor)
            : null;
          const displayImages =
            colorVariant?.images?.length
              ? colorVariant.images
              : p.colorVariants?.[0]?.images?.length
              ? p.colorVariants[0].images
              : p.images || [];
          return {
            ...p,
            selectedColor,
            displayImages,
            _wishlistItemId: item._id,
          };
        });
      res.json({ products });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/wishlist/:productId", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { productId } = req.params;
      const { selectedColor = null } = req.body;

      let wishlist = await Wishlist.findOne({ userId });
      
      if (!wishlist) {
        wishlist = new Wishlist({ userId, items: [] });
      }

      const alreadyExists = (wishlist as any).items.some(
        (item: any) =>
          item.productId.toString() === productId &&
          (item.selectedColor || null) === (selectedColor || null)
      );

      if (!alreadyExists) {
        (wishlist as any).items.push({ productId, selectedColor: selectedColor || null });
        wishlist.updatedAt = new Date();
        await wishlist.save();
      }

      const populated = await Wishlist.findById(wishlist._id).populate('items.productId').lean();
      const products = ((populated as any)?.items || [])
        .filter((item: any) => item.productId)
        .map((item: any) => {
          const p = item.productId as any;
          const selectedColor = item.selectedColor || null;
          const colorVariant = selectedColor
            ? p.colorVariants?.find((v: any) => v.color === selectedColor)
            : null;
          const displayImages =
            colorVariant?.images?.length
              ? colorVariant.images
              : p.colorVariants?.[0]?.images?.length
              ? p.colorVariants[0].images
              : p.images || [];
          return {
            ...p,
            selectedColor,
            displayImages,
            _wishlistItemId: item._id,
          };
        });
      res.json({ products });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/wishlist/:productId", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { productId } = req.params;
      const { selectedColor = null } = req.body;

      const wishlist = await Wishlist.findOne({ userId });
      if (!wishlist) {
        return res.status(404).json({ error: 'Wishlist not found' });
      }

      (wishlist as any).items = (wishlist as any).items.filter(
        (item: any) =>
          !(
            item.productId.toString() === productId &&
            (item.selectedColor || null) === (selectedColor || null)
          )
      );
      wishlist.updatedAt = new Date();
      await wishlist.save();

      const populated = await Wishlist.findById(wishlist._id).populate('items.productId').lean();
      const products = ((populated as any)?.items || [])
        .filter((item: any) => item.productId)
        .map((item: any) => {
          const p = item.productId as any;
          const selectedColor = item.selectedColor || null;
          const colorVariant = selectedColor
            ? p.colorVariants?.find((v: any) => v.color === selectedColor)
            : null;
          const displayImages =
            colorVariant?.images?.length
              ? colorVariant.images
              : p.colorVariants?.[0]?.images?.length
              ? p.colorVariants[0].images
              : p.images || [];
          return {
            ...p,
            selectedColor,
            displayImages,
            _wishlistItemId: item._id,
          };
        });
      res.json({ products });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Address Routes
  app.get("/api/addresses", authenticateToken, async (req, res) => {
    try {
      const addresses = await Address.find({ userId: (req as any).user.userId }).lean();
      res.json(addresses);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/addresses", authenticateToken, async (req, res) => {
    try {
      const address = new Address({
        userId: (req as any).user.userId,
        ...req.body
      });

      if (req.body.isDefault) {
        await Address.updateMany(
          { userId: (req as any).user.userId },
          { isDefault: false }
        );
      }

      await address.save();
      res.status(201).json(address);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/addresses/:id", authenticateToken, async (req, res) => {
    try {
      if (req.body.isDefault) {
        await Address.updateMany(
          { userId: (req as any).user.userId },
          { isDefault: false }
        );
      }

      const address = await Address.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );

      if (!address) {
        return res.status(404).json({ error: 'Address not found' });
      }

      res.json(address);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/addresses/:id", authenticateToken, async (req, res) => {
    try {
      const address = await Address.findByIdAndDelete(req.params.id);
      if (!address) {
        return res.status(404).json({ error: 'Address not found' });
      }
      res.json({ message: 'Address deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Order Routes
  app.get("/api/orders", authenticateToken, async (req, res) => {
    try {
      const orders = await Order.find({ userId: (req as any).user.userId })
        .sort({ createdAt: -1 })
        .lean();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/orders/:id", authenticateToken, async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).lean();
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Helper: deduct inventory for a list of order items (used for COD on order creation,
  // and for PhonePe orders only after payment is confirmed).
  async function deductInventoryForItems(items: any[]) {
    for (const item of items) {
      try {
        const product = await Product.findById(item.productId);
        if (!product) continue;
        (product as any).updatedAt = new Date();

        if (item.selectedSize && (product as any).category === 'BLOUSES') {
          const matchedVariant = item.selectedColor
            ? (product as any).colorVariants?.find((v: any) => v.color === item.selectedColor)
            : (product as any).colorVariants?.[0];
          if (matchedVariant?.blouseSizes?.length) {
            const sizeEntry = matchedVariant.blouseSizes.find((s: any) => s.size === item.selectedSize);
            if (sizeEntry) sizeEntry.stockQuantity = Math.max(0, (sizeEntry.stockQuantity || 0) - item.quantity);
            const variantTotalStock = matchedVariant.blouseSizes.reduce((sum: number, s: any) => sum + (s.stockQuantity || 0), 0);
            matchedVariant.stockQuantity = variantTotalStock;
            matchedVariant.inStock = variantTotalStock > 0;
          } else if ((product as any).blouseSizes?.length > 0) {
            const sizeEntry = (product as any).blouseSizes.find((s: any) => s.size === item.selectedSize);
            if (sizeEntry) sizeEntry.stockQuantity = Math.max(0, (sizeEntry.stockQuantity || 0) - item.quantity);
            const totalSizeStock = (product as any).blouseSizes.reduce((sum: number, s: any) => sum + (s.stockQuantity || 0), 0);
            (product as any).stockQuantity = totalSizeStock;
            (product as any).inStock = totalSizeStock > 0;
          }
          if ((product as any).colorVariants?.length > 0) {
            const totalVariantStock = (product as any).colorVariants.reduce((sum: number, v: any) => sum + (v.stockQuantity || 0), 0);
            (product as any).stockQuantity = totalVariantStock;
            (product as any).inStock = totalVariantStock > 0;
          }
        } else if ((product as any).colorVariants?.length > 0) {
          const variant = item.selectedColor
            ? (product as any).colorVariants.find((v: any) => v.color === item.selectedColor)
            : (product as any).colorVariants[0];
          const target = variant || (product as any).colorVariants[0];
          target.stockQuantity = Math.max(0, (target.stockQuantity || 0) - item.quantity);
          target.inStock = target.stockQuantity > 0;
          const totalVariantStock = (product as any).colorVariants.reduce((sum: number, v: any) => sum + (v.stockQuantity || 0), 0);
          (product as any).stockQuantity = totalVariantStock;
          (product as any).inStock = totalVariantStock > 0;
        } else {
          const newQty = Math.max(0, ((product as any).stockQuantity || 0) - item.quantity);
          (product as any).stockQuantity = newQty;
          (product as any).inStock = newQty > 0;
        }

        product.markModified('colorVariants');
        product.markModified('blouseSizes');
        await product.save();
      } catch (invErr: any) {
        console.error(`[INVENTORY] Failed to deduct stock for product ${item.productId}:`, invErr.message);
      }
    }
  }

  app.post("/api/orders", authenticateToken, async (req, res) => {
    try {
      const { items } = req.body;

      // Validate stock for each item before creating the order
      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          const product = await Product.findById(item.productId).lean();
          if (!product) {
            return res.status(400).json({ error: `Product not found: ${item.productId}` });
          }
          // Check size-specific stock for blouse products
          let available: number;
          if (item.selectedSize && (product as any).category === 'BLOUSES') {
            const matchedVariant = item.selectedColor
              ? (product as any).colorVariants?.find((v: any) => v.color === item.selectedColor)
              : (product as any).colorVariants?.[0];
            const variantBlouseSizes = matchedVariant?.blouseSizes?.length
              ? matchedVariant.blouseSizes
              : ((product as any).blouseSizes || []);
            const sizeEntry = variantBlouseSizes.find((s: any) => s.size === item.selectedSize);
            available = sizeEntry?.stockQuantity ?? 0;
          } else if (item.selectedColor && (product as any).colorVariants?.length > 0) {
            const variant = (product as any).colorVariants.find((v: any) => v.color === item.selectedColor);
            available = variant?.stockQuantity ?? 0;
          } else {
            available = (product as any).stockQuantity ?? 0;
          }
          if (item.quantity > available) {
            const sizeLabel = item.selectedSize ? ` (Size ${item.selectedSize})` : '';
            return res.status(400).json({
              error: `Only ${available} unit(s) available for "${(product as any).name}"${sizeLabel}. Please update your cart.`,
              availableStock: available,
              productName: (product as any).name,
            });
          }
        }
      }

      // Generate sequential order number: RM + YYYYMMDD + 2-digit sequence
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const todayCount = await Order.countDocuments({ createdAt: { $gte: startOfDay, $lt: endOfDay } });
      const sequence = String(todayCount + 1).padStart(2, '0');
      const orderNumber = `RM${dateStr}${sequence}`;

      const order = new Order({
        userId: (req as any).user.userId,
        orderNumber,
        ...req.body
      });

      await order.save();

      // Send email notification to admin
      sendNewOrderEmail(order).catch(() => {});

      // For COD orders: deduct inventory immediately.
      // For PhonePe orders: inventory is deducted only after payment is confirmed (see payment callback/webhook).
      if (req.body.paymentMethod !== 'phonepe' && Array.isArray(items) && items.length > 0) {
        await deductInventoryForItems(items);
        await Order.findByIdAndUpdate(order._id, { inventoryDeducted: true });
      }

      // Update customer profile with shipping address
      if (req.body.shippingAddress) {
        const { address, locality, city, state, pincode } = req.body.shippingAddress;
        await Customer.findByIdAndUpdate(
          (req as any).user.userId,
          {
            address: {
              street: address && locality ? `${address}, ${locality}` : address || locality,
              city: city || '',
              state: state || '',
              pincode: pincode || '',
              landmark: locality || ''
            }
          },
          { new: true }
        );
      }

      // Clear cart after order
      await Cart.findOneAndUpdate(
        { userId: (req as any).user.userId },
        { items: [], updatedAt: new Date() }
      );

      res.status(201).json(order);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/payment/phonepe/initiate", authenticateToken, async (req, res) => {
    try {
      const { orderId, amount } = req.body;

      if (!orderId || !amount) {
        return res.status(400).json({ error: 'Order ID and amount are required' });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.userId.toString() !== (req as any).user.userId) {
        return res.status(403).json({ error: 'Unauthorized access to order' });
      }

      const merchantOrderId = order.orderNumber || `RM${Date.now()}`;
      const amountInPaisa = Math.round(amount * 100);
      
      // Use HOST_URL for production (custom domain) - MUST be https://ramanifashion.in
      const baseUrl = process.env.HOST_URL || 'https://ramanifashion.in';
      const redirectUrl = `${baseUrl}/payment-callback`;
      const callbackUrl = `${baseUrl}/api/payment/phonepe/webhook`;
      
      console.log('Payment initiation - Using baseUrl:', baseUrl, 'redirectUrl:', redirectUrl);

      const paymentResponse = await phonePeService.initiatePayment({
        merchantOrderId,
        amount: amountInPaisa,
        redirectUrl,
        callbackUrl,
        udf1: orderId,
        udf2: (req as any).user.userId,
      });

      if (!paymentResponse.success) {
        return res.status(500).json({ error: paymentResponse.error || 'Failed to initiate payment' });
      }

      await Order.findByIdAndUpdate(orderId, {
        phonePeMerchantOrderId: merchantOrderId,
        phonePeOrderId: paymentResponse.orderId,
        phonePePaymentState: paymentResponse.state,
        updatedAt: new Date(),
      });

      res.json({
        success: true,
        redirectUrl: paymentResponse.redirectUrl,
        orderId: paymentResponse.orderId,
        merchantOrderId,
      });
    } catch (error: any) {
      console.error('PhonePe payment initiation error:', error);
      res.status(500).json({ error: error.message || 'Failed to initiate payment' });
    }
  });

  app.get("/api/payment/phonepe/status/:merchantOrderId", authenticateToken, async (req, res) => {
    try {
      const { merchantOrderId } = req.params;
      console.log('[STATUS CHECK] Fetching status for merchantOrderId:', merchantOrderId);

      const order = await Order.findOne({ phonePeMerchantOrderId: merchantOrderId });
      
      if (!order) {
        console.warn('[STATUS CHECK] Order not found for merchantOrderId:', merchantOrderId);
        return res.status(404).json({ error: 'Order not found' });
      }

      console.log('[STATUS CHECK] Found order:', order._id, 'Current paymentStatus:', order.paymentStatus, 'phonePePaymentState:', order.phonePePaymentState);

      if (order.userId.toString() !== (req as any).user.userId) {
        console.warn('[STATUS CHECK] Unauthorized access attempt to order:', order._id);
        return res.status(403).json({ error: 'Unauthorized access to order' });
      }

      if (order.phonePePaymentState && (order.phonePePaymentState === 'COMPLETED' || order.phonePePaymentState === 'FAILED')) {
        console.log('[STATUS CHECK] Returning cached status - already COMPLETED or FAILED:', order.phonePePaymentState);
        return res.json({
          success: true,
          state: order.phonePePaymentState,
          orderId: order.phonePeOrderId,
          amount: order.total * 100,
          paymentDetails: order.phonePePaymentDetails || {},
        });
      }

      try {
        console.log('[STATUS CHECK] Checking status from PhonePe API');
        const statusResponse = await phonePeService.checkOrderStatus(merchantOrderId);

        if (statusResponse.success) {
          // Map PhonePe states to our payment status
          let paymentStatus = 'pending';
          if (statusResponse.state === 'COMPLETED' || statusResponse.state === 'PAYMENT_SUCCESS') {
            paymentStatus = 'paid';
          } else if (statusResponse.state === 'FAILED' || statusResponse.state === 'PAYMENT_FAILED' || statusResponse.state === 'PAYMENT_ERROR') {
            paymentStatus = 'failed';
          }
          
          console.log('[STATUS CHECK] PhonePe API response:', statusResponse.state, 'mapping to paymentStatus:', paymentStatus);
          
          const updatedOrder = await Order.findByIdAndUpdate(order._id, {
            phonePePaymentState: statusResponse.state,
            phonePePaymentDetails: statusResponse.paymentDetails,
            paymentStatus,
            orderStatus: paymentStatus === 'paid' ? 'processing' : order.orderStatus,
            updatedAt: new Date(),
          }, { new: true });

          console.log('[STATUS CHECK] Order updated successfully:', updatedOrder?.paymentStatus);

          // Deduct inventory now that payment is confirmed (only once)
          if (paymentStatus === 'paid' && !order.inventoryDeducted && order.items?.length > 0) {
            console.log('[STATUS CHECK] Deducting inventory for confirmed PhonePe payment');
            await deductInventoryForItems(order.items as any[]);
            await Order.findByIdAndUpdate(order._id, { inventoryDeducted: true });
          }

          return res.json({
            success: true,
            state: statusResponse.state,
            orderId: statusResponse.orderId,
            amount: statusResponse.amount,
            paymentDetails: statusResponse.paymentDetails,
          });
        }
      } catch (phonePeError) {
        console.error('[STATUS CHECK] PhonePe SDK error:', phonePeError);
      }

      console.log('[STATUS CHECK] Returning current order status:', order.phonePePaymentState);
      return res.json({
        success: true,
        state: order.phonePePaymentState || 'PENDING',
        orderId: order.phonePeOrderId,
        amount: order.total * 100,
        paymentDetails: order.phonePePaymentDetails || {},
      });
    } catch (error: any) {
      console.error('[STATUS CHECK] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to check payment status' });
    }
  });

  // PhonePe redirect callback after payment - handle both GET and POST
  const handlePaymentCallback = async (req: any, res: any) => {
    try {
      console.log('[PAYMENT CALLBACK] ===== CALLBACK STARTED =====');
      console.log('[PAYMENT CALLBACK] Received - body:', JSON.stringify(req.body));
      console.log('[PAYMENT CALLBACK] Received - query:', JSON.stringify(req.query));
      
      let merchantOrderId = null;
      let paymentStatus = 'PENDING';

      // Step 1: Try to extract from base64 response
      const base64Response = req.body?.response || req.query?.response || req.body?.['response'];
      
      if (base64Response) {
        try {
          const decodedResponse = Buffer.from(base64Response, 'base64').toString('utf-8');
          const paymentData = JSON.parse(decodedResponse);
          console.log('[PAYMENT CALLBACK] Decoded base64 response:', JSON.stringify(paymentData));
          
          merchantOrderId = paymentData.merchantOrderId || paymentData.merchantTransactionId;
          paymentStatus = paymentData.state || 'PENDING';
          console.log('[PAYMENT CALLBACK] Extracted from base64 - Order ID:', merchantOrderId, 'Status:', paymentStatus);
        } catch (parseError) {
          console.error('[PAYMENT CALLBACK] Failed to parse base64 response:', parseError);
        }
      }

      // Step 2: If no merchantOrderId found, try to find the most recent order for this user
      if (!merchantOrderId) {
        console.log('[PAYMENT CALLBACK] No merchantOrderId extracted, searching for recent orders...');
        try {
          // Try to get user from session or auth if available
          const recentOrder = await Order.findOne()
            .sort({ createdAt: -1 })
            .limit(1);
          
          if (recentOrder && recentOrder.phonePeMerchantOrderId) {
            merchantOrderId = recentOrder.phonePeMerchantOrderId;
            console.log('[PAYMENT CALLBACK] Found recent order with merchantOrderId:', merchantOrderId);
          }
        } catch (err) {
          console.error('[PAYMENT CALLBACK] Error finding recent order:', err);
        }
      }

      // Step 3: If we have merchantOrderId, check PhonePe API status and update database
      if (merchantOrderId) {
        console.log('[PAYMENT CALLBACK] Fetching order for merchantOrderId:', merchantOrderId);
        const order = await Order.findOne({ phonePeMerchantOrderId: merchantOrderId });
        
        if (order) {
          console.log('[PAYMENT CALLBACK] Found order:', order._id);
          
          // Query PhonePe API directly to get the current status
          try {
            console.log('[PAYMENT CALLBACK] Checking PhonePe API status for:', merchantOrderId);
            const statusResponse = await phonePeService.checkOrderStatus(merchantOrderId);
            
            if (statusResponse.success && statusResponse.state) {
              paymentStatus = statusResponse.state;
              console.log('[PAYMENT CALLBACK] PhonePe API returned state:', paymentStatus);
              
              // Map PhonePe states to our payment status
              let dbPaymentStatus = 'pending';
              if (paymentStatus === 'COMPLETED' || paymentStatus === 'PAYMENT_SUCCESS') {
                dbPaymentStatus = 'paid';
              } else if (paymentStatus === 'FAILED' || paymentStatus === 'PAYMENT_FAILED' || paymentStatus === 'PAYMENT_ERROR') {
                dbPaymentStatus = 'failed';
              }
              
              console.log('[PAYMENT CALLBACK] Updating order with paymentStatus:', dbPaymentStatus);
              const updatedOrder = await Order.findByIdAndUpdate(order._id, {
                phonePePaymentState: paymentStatus,
                paymentStatus: dbPaymentStatus,
                orderStatus: dbPaymentStatus === 'paid' ? 'processing' : undefined,
                updatedAt: new Date(),
              }, { new: true });
              
              console.log('[PAYMENT CALLBACK] Order updated - new paymentStatus:', updatedOrder?.paymentStatus);

              // Deduct inventory now that payment is confirmed (only once)
              if (dbPaymentStatus === 'paid' && !order.inventoryDeducted && order.items?.length > 0) {
                console.log('[PAYMENT CALLBACK] Deducting inventory for confirmed PhonePe payment');
                await deductInventoryForItems(order.items as any[]);
                await Order.findByIdAndUpdate(order._id, { inventoryDeducted: true });
              }
            }
          } catch (apiError) {
            console.error('[PAYMENT CALLBACK] Error checking PhonePe API:', apiError);
            // Continue anyway, we'll still redirect
          }
        } else {
          console.warn('[PAYMENT CALLBACK] Order not found for merchantOrderId:', merchantOrderId);
        }
      } else {
        console.warn('[PAYMENT CALLBACK] Could not determine merchantOrderId, will show pending');
      }

      // Final redirect
      const frontendUrl = process.env.HOST_URL || 'https://ramanifashion.in';
      console.log('[PAYMENT CALLBACK] ===== REDIRECTING to orders =====');
      console.log('[PAYMENT CALLBACK] Redirect URL:', `${frontendUrl}/orders?paymentStatus=${paymentStatus}&merchantOrderId=${merchantOrderId}`);
      
      return res.redirect(`${frontendUrl}/orders?paymentStatus=${paymentStatus}&merchantOrderId=${merchantOrderId || ''}`);
    } catch (error: any) {
      console.error('[PAYMENT CALLBACK] ===== FATAL ERROR =====', error);
      const frontendUrl = process.env.HOST_URL || 'https://ramanifashion.in';
      res.redirect(`${frontendUrl}/orders?paymentStatus=error`);
    }
  };

  app.post("/payment-callback", handlePaymentCallback);
  app.get("/payment-callback", handlePaymentCallback);

  app.post("/api/payment/phonepe/webhook", async (req, res) => {
    try {
      console.log('[WEBHOOK] Received - body:', JSON.stringify(req.body));
      
      const authHeader = req.headers['authorization'];
      const responseBody = JSON.stringify(req.body);

      const webhookUsername = process.env.PHONEPE_WEBHOOK_USERNAME || '';
      const webhookPassword = process.env.PHONEPE_WEBHOOK_PASSWORD || '';

      const validationResult = phonePeService.validateCallback({
        authHeader: authHeader as string,
        responseBody,
        webhookUsername,
        webhookPassword
      });

      if (!validationResult.isValid) {
        console.warn('[WEBHOOK] Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      const callbackData = validationResult.data;
      console.log('[WEBHOOK] Validated data:', JSON.stringify(callbackData));
      
      if (callbackData && callbackData.merchantOrderId) {
        const order = await Order.findOne({ phonePeMerchantOrderId: callbackData.merchantOrderId });
        console.log('[WEBHOOK] Found order:', order?._id, 'for merchantOrderId:', callbackData.merchantOrderId);
        
        if (order) {
          // Map PhonePe states to our payment status
          let paymentStatus = 'pending';
          if (callbackData.state === 'COMPLETED' || callbackData.state === 'PAYMENT_SUCCESS') {
            paymentStatus = 'paid';
          } else if (callbackData.state === 'FAILED' || callbackData.state === 'PAYMENT_FAILED' || callbackData.state === 'PAYMENT_ERROR') {
            paymentStatus = 'failed';
          }
          
          console.log('[WEBHOOK] Updating order with state:', callbackData.state, 'mapped to paymentStatus:', paymentStatus);
          
          const updatedOrder = await Order.findByIdAndUpdate(order._id, {
            phonePePaymentState: callbackData.state,
            phonePeTransactionId: callbackData.transactionId,
            phonePePaymentDetails: callbackData.paymentDetails,
            paymentStatus,
            orderStatus: paymentStatus === 'paid' ? 'processing' : order.orderStatus,
            updatedAt: new Date(),
          }, { new: true });
          
          console.log('[WEBHOOK] Order updated successfully - new paymentStatus:', updatedOrder?.paymentStatus);

          // Deduct inventory now that payment is confirmed (only once)
          if (paymentStatus === 'paid' && !order.inventoryDeducted && order.items?.length > 0) {
            console.log('[WEBHOOK] Deducting inventory for confirmed PhonePe payment');
            await deductInventoryForItems(order.items as any[]);
            await Order.findByIdAndUpdate(order._id, { inventoryDeducted: true });
          }

          // Send SMS notification for payment outcome
          try {
            const populatedForSms = await Order.findById(order._id).populate('userId', 'phone');
            const phoneForSms = (populatedForSms?.userId as any)?.phone || order.shippingAddress?.phone;
            const orderNum = order.orderNumber || String(order._id);
            if (phoneForSms) {
              if (paymentStatus === 'paid') {
                await sendOrderConfirmationSMS(phoneForSms, orderNum);
              } else if (paymentStatus === 'failed') {
                await sendPaymentFailureSMS(phoneForSms, orderNum);
              }
            }
          } catch (smsErr) {
            console.error('[WEBHOOK] SMS notification failed:', smsErr);
          }
        }
      } else {
        console.warn('[WEBHOOK] No merchantOrderId found in callback data');
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[WEBHOOK] Error:', error);
      res.status(500).json({ error: error.message || 'Webhook processing failed' });
    }
  });

  // Get filter options
  app.get("/api/filters", async (req, res) => {
    try {
      const categories = await Product.distinct('category');
      const fabrics = await Product.distinct('fabric');
      const colors = await Product.distinct('color');
      const occasions = await Product.distinct('occasion');

      res.json({ categories, fabrics, colors, occasions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get dynamic price range based on filters
  app.get("/api/price-range", async (req, res) => {
    try {
      const {
        category,
        mainCategory,
        fabric,
        color,
        occasion,
        inStock,
        search,
        onSale
      } = req.query;

      const query: any = {};

      // mainCategory: match by parent category name OR subcategory names (same logic as /api/products)
      if (mainCategory) {
        const mainCatName = (mainCategory as string).trim();
        const catDoc = await Category.findOne({ name: { $regex: new RegExp(`^${mainCatName}$`, 'i') } });
        const subNames = catDoc?.subCategories?.map((s: any) => s.name) || [];
        const orConditions: any[] = [{ category: catDoc?.name || mainCatName }];
        if (subNames.length > 0) orConditions.push({ category: { $in: subNames } });
        query.$or = orConditions;
      } else if (category) {
        const categories = (category as string).split(',').filter(Boolean);
        const catValues = categories.length > 1 ? categories : categories[0];
        query.$or = [
          { category: typeof catValues === 'string' ? catValues : { $in: catValues } },
          { subcategory: typeof catValues === 'string' ? catValues : { $in: catValues } },
        ];
      }
      if (fabric) {
        const fabrics = (fabric as string).split(',').filter(Boolean);
        query.fabric = fabrics.length > 1 ? { $in: fabrics } : fabrics[0];
      }
      if (color) {
        const colors = (color as string).split(',').filter(Boolean);
        query['colorVariants.color'] = colors.length > 1 ? { $in: colors } : colors[0];
      }
      if (occasion) {
        const occasions = (occasion as string).split(',').filter(Boolean);
        query.occasion = occasions.length > 1 ? { $in: occasions } : occasions[0];
      }
      
      if (inStock === 'true') query.inStock = true;
      if (req.query.isNew === 'true') addPriceRangeAndCondition({ $or: [{ 'colorVariants.isNew': true }, { category: 'JEWELLERY', isNew: true }] });
      if (req.query.isBestseller === 'true') addPriceRangeAndCondition({ $or: [{ 'colorVariants.isBestseller': true }, { category: 'JEWELLERY', isBestseller: true }] });
      if (req.query.isTrending === 'true') addPriceRangeAndCondition({ $or: [{ 'colorVariants.isTrending': true }, { category: 'JEWELLERY', isTrending: true }] });
      
      // Filter for sale products
      if (onSale === 'true') {
        query.onSale = true;
      }
      
      if (search) {
        query.$text = { $search: search as string };
      }

      // Use aggregation to get min and max prices
      const result = await Product.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            minPrice: { $min: '$price' },
            maxPrice: { $max: '$price' }
          }
        }
      ]);

      const priceRange = result.length > 0 
        ? { minPrice: result[0].minPrice || 0, maxPrice: result[0].maxPrice || 0 }
        : { minPrice: 0, maxPrice: 0 };

      res.json(priceRange);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contact Form Routes
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, mobile, email, subject, category, message } = req.body;

      if (!name || !mobile || !email || !subject || !category) {
        return res.status(400).json({ error: 'All required fields must be filled' });
      }

      const contactSubmission = new ContactSubmission({
        name,
        mobile,
        email,
        subject,
        category,
        message: message || ''
      });

      await contactSubmission.save();
      res.status(201).json({ 
        message: 'Contact form submitted successfully',
        submission: contactSubmission 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contact", async (req, res) => {
    try {
      const submissions = await ContactSubmission.find()
        .sort({ createdAt: -1 })
        .lean();
      res.json(submissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin Authentication Routes
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      const admin = await AdminUser.findOne({ email: username });
      if (!admin) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }

      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }

      const token = jwt.sign(
        { adminId: admin._id.toString(), username: admin.email, role: admin.role },
        ADMIN_JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        admin: { id: admin._id.toString(), username: admin.email, role: admin.role }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/verify", authenticateAdmin, async (req, res) => {
    res.json({ valid: true, admin: req.admin });
  });

  // Admin Product Management (protected)
  app.post("/api/admin/products", authenticateAdmin, async (req, res) => {
    try {
      const productData = { ...req.body };
      if (Array.isArray(productData.colorVariants) && productData.colorVariants.length > 0) {
        productData.colorVariants = productData.colorVariants.map((variant: any) => {
          const stockQuantity = Math.max(0, Number(variant.stockQuantity) || 0);
          return {
            ...variant,
            color: typeof variant.color === 'string' ? variant.color.trim() : variant.color,
            stockQuantity,
            inStock: stockQuantity > 0,
          };
        });
        productData.stockQuantity = productData.colorVariants.reduce((sum: number, variant: any) => sum + (variant.stockQuantity || 0), 0);
        productData.inStock = productData.stockQuantity > 0;
      }
      if (typeof productData.subcategory === 'string') productData.subcategory = productData.subcategory.trim();
      const product = new Product(productData);
      await product.save();
      res.status(201).json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/products/:id", authenticateAdmin, async (req, res) => {
    try {
      const updateData = { ...req.body, updatedAt: new Date() };
      if (Array.isArray(updateData.colorVariants) && updateData.colorVariants.length > 0) {
        updateData.colorVariants = updateData.colorVariants.map((variant: any) => {
          const stockQuantity = Math.max(0, Number(variant.stockQuantity) || 0);
          return {
            ...variant,
            color: typeof variant.color === 'string' ? variant.color.trim() : variant.color,
            stockQuantity,
            inStock: stockQuantity > 0,
          };
        });
        updateData.stockQuantity = updateData.colorVariants.reduce((sum: number, variant: any) => sum + (variant.stockQuantity || 0), 0);
        updateData.inStock = updateData.stockQuantity > 0;
      }
      if (typeof updateData.subcategory === 'string') updateData.subcategory = updateData.subcategory.trim();

      if (updateData.stockQuantity !== undefined) {
        updateData.inStock = updateData.stockQuantity > 0;
      }

      // Before updating, find the old product and delete any images that are being removed
      const oldProduct = await Product.findById(req.params.id);
      if (oldProduct) {
        const oldUrls = new Set(extractProductImageUrls(oldProduct));
        const newUrls = new Set(extractProductImageUrls(updateData));
        const removed = [...oldUrls].filter(url => !newUrls.has(url));
        deleteLocalImages(removed);
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/products/:id", authenticateAdmin, async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      deleteLocalImages(extractProductImageUrls(product));
      await product.deleteOne();
      res.json({ message: 'Product deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin Image Upload Route — uploads to Cloudinary, stores URL in MongoDB
  app.post("/api/admin/upload-images", authenticateAdmin, (req, res) => {
    upload.array('images', 5)(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large (max 100MB per file)' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: 'Too many files (max 5 files)' });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const files = req.files as Express.Multer.File[];

      try {
        const uploadResults = await Promise.all(
          files.map(async (file) => {
            const receivedKB = (file.buffer.length / 1024).toFixed(1);
            const receivedMB = (file.buffer.length / 1024 / 1024).toFixed(2);
            console.log(`[Upload] Server received: ${file.originalname} — ${receivedMB} MB (${receivedKB} KB) — mimetype: ${file.mimetype}`);
            const url = await saveImageLocally(file.buffer, file.originalname);
            return { url, receivedBytes: file.buffer.length, receivedMB: parseFloat(receivedMB) };
          })
        );

        res.json({
          success: true,
          urls: uploadResults.map(r => r.url),
          debug: uploadResults.map(r => ({ receivedBytes: r.receivedBytes, receivedMB: r.receivedMB })),
          message: `${files.length} file(s) uploaded successfully`
        });
      } catch (uploadError: any) {
        console.error('[LocalStorage] Upload error:', uploadError);
        res.status(500).json({ error: 'Failed to upload images', details: uploadError.message });
      }
    });
  });

  // Admin Inventory Management Route
  app.get("/api/admin/inventory", authenticateAdmin, async (req, res) => {
    try {
      const products = await Product.find()
        .select('name category subcategory stockQuantity inStock price colorVariants createdAt')
        .sort({ createdAt: -1 })
        .lean();

      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/inventory/:id", authenticateAdmin, async (req, res) => {
    try {
      const { stockQuantity, inStock } = req.body;
      const resolvedInStock = inStock !== undefined ? inStock : stockQuantity > 0;

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { stockQuantity, inStock: resolvedInStock, updatedAt: new Date() },
        { new: true }
      );

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Sync stockQuantity to all colorVariants
      if (product.colorVariants && product.colorVariants.length > 0) {
        await Product.updateOne(
          { _id: req.params.id },
          { $set: { 'colorVariants.$[].stockQuantity': stockQuantity, 'colorVariants.$[].inStock': resolvedInStock } }
        );
      }

      const updated = await Product.findById(req.params.id).lean();
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Excel Import/Export Routes
  app.post("/api/admin/products/import", authenticateAdmin, (req, res) => {
    upload.single('file')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      try {
        // Read the Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Delete the uploaded file after reading
        fs.unlinkSync(req.file.path);

        // Validate and insert products
        const importedProducts = [];
        const errors = [];

        for (let i = 0; i < jsonData.length; i++) {
          try {
            const row: any = jsonData[i];
            
            // Map Excel columns to product fields
            const productData: any = {
              name: row.Name || row.name,
              description: row.Description || row.description || '',
              price: parseFloat(row.Price || row.price || 0),
              originalPrice: row['Original Price'] || row.originalPrice ? parseFloat(row['Original Price'] || row.originalPrice) : undefined,
              category: row.Category || row.category,
              subcategory: row.Subcategory || row.subcategory,
              fabric: row.Fabric || row.fabric,
              color: row.Color || row.color,
              occasion: row.Occasion || row.occasion,
              pattern: row.Pattern || row.pattern,
              workType: row['Work Type'] || row.workType,
              blousePiece: row['Blouse Piece'] === 'Yes' || row.blousePiece === true,
              sareeLength: row['Saree Length'] || row.sareeLength,
              stockQuantity: parseInt(row['Stock Quantity'] || row.stockQuantity || '0'),
              inStock: row['In Stock'] === 'Yes' || row.inStock === true || parseInt(row['Stock Quantity'] || row.stockQuantity || '0') > 0,
              isNew: row['Is New'] === 'Yes' || row.isNew === true,
              isBestseller: row['Is Bestseller'] === 'Yes' || row.isBestseller === true,
              isTrending: row['Is Trending'] === 'Yes' || row.isTrending === true,
            };

            // Handle images (comma-separated URLs)
            const imagesStr = row.Images || row.images || '';
            if (imagesStr) {
              productData.images = imagesStr.split(',').map((url: string) => url.trim()).filter(Boolean);
            }

            // Validate required fields
            if (!productData.name || !productData.category || !productData.price) {
              errors.push(`Row ${i + 2}: Missing required fields (Name, Category, or Price)`);
              continue;
            }

            const product = new Product(productData);
            await product.save();
            importedProducts.push(product);
          } catch (error: any) {
            errors.push(`Row ${i + 2}: ${error.message}`);
          }
        }

        res.json({
          success: true,
          imported: importedProducts.length,
          errors: errors,
          message: `Successfully imported ${importedProducts.length} products${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  app.get("/api/admin/products/export", authenticateAdmin, async (req, res) => {
    try {
      const products = await Product.find().lean();

      // Convert products to Excel format
      const excelData = products.map((product: any) => ({
        Name: product.name,
        Description: product.description,
        Price: product.price,
        'Original Price': product.originalPrice || '',
        Category: product.category,
        Subcategory: product.subcategory || '',
        Fabric: product.fabric || '',
        Color: product.color || '',
        Occasion: product.occasion || '',
        Pattern: product.pattern || '',
        'Work Type': product.workType || '',
        'Blouse Piece': product.blousePiece ? 'Yes' : 'No',
        'Saree Length': product.sareeLength || '',
        'Stock Quantity': product.stockQuantity || 0,
        'In Stock': product.inStock ? 'Yes' : 'No',
        'Is New': product.isNew ? 'Yes' : 'No',
        'Is Bestseller': product.isBestseller ? 'Yes' : 'No',
        'Is Trending': product.isTrending ? 'Yes' : 'No',
        Images: (product.images || []).join(', '),
      }));

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const colWidths = [
        { wch: 30 }, // Name
        { wch: 50 }, // Description
        { wch: 10 }, // Price
        { wch: 12 }, // Original Price
        { wch: 20 }, // Category
        { wch: 20 }, // Subcategory
        { wch: 15 }, // Fabric
        { wch: 15 }, // Color
        { wch: 15 }, // Occasion
        { wch: 15 }, // Pattern
        { wch: 15 }, // Work Type
        { wch: 12 }, // Blouse Piece
        { wch: 15 }, // Saree Length
        { wch: 12 }, // Stock Quantity
        { wch: 10 }, // In Stock
        { wch: 10 }, // Is New
        { wch: 12 }, // Is Bestseller
        { wch: 12 }, // Is Trending
        { wch: 80 }, // Images
      ];
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename=products_export_${Date.now()}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Inventory Export Route
  app.get("/api/admin/inventory/export", authenticateAdmin, async (req, res) => {
    try {
      const products = await Product.find().lean();

      const excelData = products.map((product: any) => {
        const variants = (product.colorVariants || [])
          .map((v: any) => `${v.color} (Stock: ${v.stockQuantity ?? 0})`)
          .join('; ');
        return {
          'Product Name': product.name,
          'Category': product.category,
          'Subcategory': product.subcategory || '',
          'Price': product.price,
          'Original Price': product.originalPrice || '',
          'Fabric': product.fabric || '',
          'Occasion': product.occasion || '',
          'Pattern': product.pattern || '',
          'Work Type': product.workType || '',
          'Blouse Piece': product.blousePiece ? 'Yes' : 'No',
          'Saree Length': product.sareeLength || '',
          'Stock Quantity': product.stockQuantity || 0,
          'In Stock': product.inStock ? 'Yes' : 'No',
          'Is New': product.isNew ? 'Yes' : 'No',
          'Is Bestseller': product.isBestseller ? 'Yes' : 'No',
          'Is Trending': product.isTrending ? 'Yes' : 'No',
          'Color Variants': variants,
          'Description': product.description || '',
        };
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      worksheet['!cols'] = [
        { wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
        { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
        { wch: 12 }, { wch: 40 }, { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename=inventory_export_${Date.now()}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Inventory Import Route (skips existing products by name)
  app.post("/api/admin/inventory/import", authenticateAdmin, (req, res) => {
    upload.single('file')(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        fs.unlinkSync(req.file.path);

        let imported = 0;
        let skipped = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < jsonData.length; i++) {
          const row: any = jsonData[i];
          const rowNum = i + 2;

          try {
            const name = row['Product Name'] || row['Name'] || row['name'] || '';
            if (!name) {
              errors.push(`Row ${rowNum}: Missing product name`);
              failed++;
              continue;
            }

            // Skip if product with this name already exists (case-insensitive)
            const exists = await Product.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
            if (exists) {
              skipped++;
              continue;
            }

            const price = parseFloat(row['Price'] || row['price'] || '0');
            const category = row['Category'] || row['category'] || '';

            if (!category || !price) {
              errors.push(`Row ${rowNum}: Missing required fields (Category or Price)`);
              failed++;
              continue;
            }

            const productData: any = {
              name,
              description: row['Description'] || row['description'] || '',
              price,
              originalPrice: row['Original Price'] || row['originalPrice'] ? parseFloat(row['Original Price'] || row['originalPrice']) : undefined,
              category,
              subcategory: row['Subcategory'] || row['subcategory'] || '',
              fabric: row['Fabric'] || row['fabric'] || '',
              occasion: row['Occasion'] || row['occasion'] || '',
              pattern: row['Pattern'] || row['pattern'] || '',
              workType: row['Work Type'] || row['workType'] || '',
              blousePiece: (row['Blouse Piece'] || row['blousePiece'] || '') === 'Yes',
              sareeLength: row['Saree Length'] || row['sareeLength'] || '',
              stockQuantity: parseInt(row['Stock Quantity'] || row['stockQuantity'] || '0'),
              inStock: (row['In Stock'] || row['inStock'] || 'No') === 'Yes',
              isNew: (row['Is New'] || row['isNew'] || 'No') === 'Yes',
              isBestseller: (row['Is Bestseller'] || row['isBestseller'] || 'No') === 'Yes',
              isTrending: (row['Is Trending'] || row['isTrending'] || 'No') === 'Yes',
              colorVariants: [{
                color: row['Color'] || row['color'] || 'Default',
                images: [],
                stockQuantity: parseInt(row['Stock Quantity'] || row['stockQuantity'] || '0'),
                inStock: (row['In Stock'] || row['inStock'] || 'No') === 'Yes',
              }],
            };

            const product = new Product(productData);
            await product.save();
            imported++;
          } catch (error: any) {
            errors.push(`Row ${rowNum}: ${error.message}`);
            failed++;
          }
        }

        res.json({
          success: true,
          imported,
          skipped,
          failed,
          errors,
          message: `Import complete: ${imported} imported, ${skipped} skipped (already exist), ${failed} failed.`,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  // Admin Analytics Routes
  app.get("/api/admin/analytics", authenticateAdmin, async (req, res) => {
    try {
      const totalProducts = await Product.countDocuments();
      const totalUsers = await User.countDocuments();
      const totalOrders = await Order.countDocuments();

      // Only count revenue from confirmed/paid orders (exclude pending & cancelled)
      const PAID_STATUSES = ['approved', 'processing', 'shipped', 'delivered'];
      const paidOrderFilter = { orderStatus: { $in: PAID_STATUSES } };

      const orders = await Order.find().lean();
      const paidOrders = orders.filter(o => PAID_STATUSES.includes(o.orderStatus));
      const totalRevenue = paidOrders.reduce((sum, order) => sum + (order.total || 0), 0);
      
      const lowStockProducts = await Product.countDocuments({ stockQuantity: { $lt: 10 } });
      const outOfStockProducts = await Product.countDocuments({ inStock: false });
      
      const recentOrders = await Order.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'name email')
        .lean();

      const topProducts = await Product.find()
        .sort({ rating: -1 })
        .limit(5)
        .lean();

      // Monthly sales data for the last 6 months (paid orders only)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const monthlyOrders = await Order.aggregate([
        {
          $match: { createdAt: { $gte: sixMonthsAgo }, ...paidOrderFilter }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            revenue: { $sum: "$total" },
            orders: { $sum: 1 }
          }
        },
        {
          $sort: { "_id.year": 1, "_id.month": 1 }
        }
      ]);

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const salesData = monthlyOrders.map(item => ({
        month: monthNames[item._id.month - 1],
        revenue: Math.round(item.revenue),
        orders: item.orders
      }));

      // Category distribution
      const categoryStats = await Product.aggregate([
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 }
          }
        }
      ]);

      const totalProductsForPercentage = await Product.countDocuments();
      const categoryData = categoryStats.map((cat, index) => ({
        name: cat._id || 'Other',
        value: cat.count,
        percentage: totalProductsForPercentage > 0 ? Math.round((cat.count / totalProductsForPercentage) * 100) : 0
      }));

      // Weekly sales for last 4 weeks
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      
      const weeklyOrders = await Order.aggregate([
        {
          $match: { createdAt: { $gte: fourWeeksAgo }, ...paidOrderFilter }
        },
        {
          $group: {
            _id: {
              week: { $week: "$createdAt" }
            },
            sales: { $sum: "$total" }
          }
        },
        {
          $sort: { "_id.week": 1 }
        }
      ]);

      const recentActivity = weeklyOrders.map((item, index) => ({
        month: `Week ${index + 1}`,
        sales: Math.round(item.sales)
      }));

      // Customer growth over last 6 months
      const customerGrowth = await Customer.aggregate([
        {
          $match: { createdAt: { $gte: sixMonthsAgo } }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            customers: { $sum: 1 }
          }
        },
        {
          $sort: { "_id.year": 1, "_id.month": 1 }
        }
      ]);

      // Build cumulative customer growth data
      let cumulativeCustomers = 0;
      // Get count of customers before 6 months ago
      const customersBeforePeriod = await Customer.countDocuments({ 
        createdAt: { $lt: sixMonthsAgo } 
      });
      cumulativeCustomers = customersBeforePeriod;

      const customerGrowthData = customerGrowth.map(item => {
        cumulativeCustomers += item.customers;
        return {
          month: monthNames[item._id.month - 1],
          customers: cumulativeCustomers,
          newCustomers: item.customers
        };
      });

      // Order status trends over last 6 months
      const orderStatusTrends = await Order.aggregate([
        {
          $match: { createdAt: { $gte: sixMonthsAgo } }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
              status: "$orderStatus"
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id.year": 1, "_id.month": 1 }
        }
      ]);

      // Organize order status by month
      const orderTrendsMap = new Map();
      orderStatusTrends.forEach(item => {
        const monthKey = `${item._id.year}-${item._id.month}`;
        if (!orderTrendsMap.has(monthKey)) {
          orderTrendsMap.set(monthKey, {
            month: monthNames[item._id.month - 1],
            completed: 0,
            pending: 0,
            cancelled: 0,
            processing: 0,
            shipped: 0
          });
        }
        const monthData = orderTrendsMap.get(monthKey);
        const status = (item._id.status || 'pending').toLowerCase();
        if (status === 'delivered' || status === 'completed') {
          monthData.completed += item.count;
        } else if (status === 'pending') {
          monthData.pending += item.count;
        } else if (status === 'cancelled') {
          monthData.cancelled += item.count;
        } else if (status === 'processing' || status === 'confirmed') {
          monthData.processing += item.count;
        } else if (status === 'shipped') {
          monthData.shipped += item.count;
        }
      });

      const orderTrendsData = Array.from(orderTrendsMap.values());

      // Calculate growth percentages
      const currentMonthOrders = orders.filter(o => {
        const orderDate = new Date(o.createdAt);
        const now = new Date();
        return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      }).length;

      const lastMonthOrders = orders.filter(o => {
        const orderDate = new Date(o.createdAt);
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
        return orderDate.getMonth() === lastMonth.getMonth() && orderDate.getFullYear() === lastMonth.getFullYear();
      }).length;

      const orderGrowth = lastMonthOrders > 0 
        ? Math.round(((currentMonthOrders - lastMonthOrders) / lastMonthOrders) * 100) 
        : 0;

      // Customer growth calculation
      const allCustomers = await Customer.find().lean();
      const currentMonthCustomers = allCustomers.filter(c => {
        const regDate = new Date(c.createdAt);
        const now = new Date();
        return regDate.getMonth() === now.getMonth() && regDate.getFullYear() === now.getFullYear();
      }).length;

      const lastMonthCustomers = allCustomers.filter(c => {
        const regDate = new Date(c.createdAt);
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
        return regDate.getMonth() === lastMonth.getMonth() && regDate.getFullYear() === lastMonth.getFullYear();
      }).length;

      const customerGrowthPercentage = lastMonthCustomers > 0 
        ? Math.round(((currentMonthCustomers - lastMonthCustomers) / lastMonthCustomers) * 100) 
        : currentMonthCustomers > 0 ? 100 : 0;

      // Average order value growth (paid orders only)
      const currentMonthRevenue = paidOrders.filter(o => {
        const orderDate = new Date(o.createdAt);
        const now = new Date();
        return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      }).reduce((sum, o) => sum + (o.total || 0), 0);

      const lastMonthRevenue = paidOrders.filter(o => {
        const orderDate = new Date(o.createdAt);
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
        return orderDate.getMonth() === lastMonth.getMonth() && orderDate.getFullYear() === lastMonth.getFullYear();
      }).reduce((sum, o) => sum + (o.total || 0), 0);

      const currentAvgOrderValue = currentMonthOrders > 0 ? currentMonthRevenue / currentMonthOrders : 0;
      const lastAvgOrderValue = lastMonthOrders > 0 ? lastMonthRevenue / lastMonthOrders : 0;
      const avgOrderValueGrowth = lastAvgOrderValue > 0 
        ? Math.round(((currentAvgOrderValue - lastAvgOrderValue) / lastAvgOrderValue) * 100) 
        : 0;

      const revenueGrowth = lastMonthRevenue > 0
        ? Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
        : currentMonthRevenue > 0 ? 100 : 0;

      // Today's orders
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayOrders = orders.filter(o => new Date(o.createdAt) >= todayStart).length;

      // Pending orders (need attention)
      const pendingOrders = orders.filter(o => o.orderStatus === 'pending').length;
      const processingOrders = orders.filter(o => o.orderStatus === 'processing' || o.orderStatus === 'approved').length;
      const shippedOrders = orders.filter(o => o.orderStatus === 'shipped').length;
      const deliveredOrders = orders.filter(o => o.orderStatus === 'delivered').length;
      const cancelledOrders = orders.filter(o => o.orderStatus === 'cancelled').length;

      const orderStatusBreakdown = [
        { name: 'Pending', value: pendingOrders, color: '#f59e0b' },
        { name: 'Processing', value: processingOrders, color: '#3b82f6' },
        { name: 'Shipped', value: shippedOrders, color: '#8b5cf6' },
        { name: 'Delivered', value: deliveredOrders, color: '#10b981' },
        { name: 'Cancelled', value: cancelledOrders, color: '#ef4444' },
      ].filter(s => s.value > 0);

      res.json({
        totalProducts,
        totalUsers,
        totalOrders,
        totalRevenue,
        totalCustomers: allCustomers.length,
        lowStockProducts,
        outOfStockProducts,
        recentOrders,
        topProducts,
        salesData,
        categoryData,
        recentActivity,
        customerGrowthData,
        orderTrendsData,
        currentMonthRevenue: Math.round(currentMonthRevenue),
        lastMonthRevenue: Math.round(lastMonthRevenue),
        currentMonthOrders,
        lastMonthOrders,
        currentMonthCustomers,
        todayOrders,
        pendingOrders,
        orderStatusBreakdown,
        growthStats: {
          orderGrowth,
          customerGrowthPercentage,
          avgOrderValueGrowth,
          revenueGrowth
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/customers", authenticateAdmin, async (req, res) => {
    try {
      const {
        search,
        sort = 'createdAt',
        order = 'desc',
        page = '1',
        limit = '50',
        paidUsers,
        city,
        state,
        lastActivityDays
      } = req.query;

      const query: any = {};

      // Search by phone, name, or email
      if (search) {
        const searchRegex = new RegExp(search as string, 'i');
        query.$or = [
          { phone: searchRegex },
          { name: searchRegex },
          { email: searchRegex }
        ];
      }

      // Filter by paid users (customers with at least one paid/completed order)
      if (paidUsers === 'true') {
        const paidCustomerIds = await Order.find({
          paymentStatus: 'paid'
        }).distinct('userId').lean();
        query._id = { $in: paidCustomerIds };
      }

      // Filter by city and/or state using Address collection
      const addressFilters: any = {};
      if (city && city !== '') {
        addressFilters.city = new RegExp(city as string, 'i');
      }
      if (state && state !== '') {
        addressFilters.state = new RegExp(state as string, 'i');
      }

      if (Object.keys(addressFilters).length > 0) {
        // Find all addresses matching the filters
        const matchingAddresses = await Address.find(addressFilters)
          .distinct('userId')
          .lean();
        
        // If there are matching addresses, filter customers by those userIds
        if (matchingAddresses && matchingAddresses.length > 0) {
          query._id = { $in: matchingAddresses };
        } else {
          // No matching addresses, return empty result
          query._id = { $in: [] };
        }
      }

      // Filter by last activity (lastLogin within N days)
      if (lastActivityDays) {
        const days = parseInt(lastActivityDays as string);
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - days);
        query.lastLogin = { $gte: dateThreshold };
      }

      const pageNum = parseInt(page as string);
      const limitNum = Math.min(parseInt(limit as string), 100); // Max 100 customers per page
      const skip = (pageNum - 1) * limitNum;

      // Build sort object
      const sortObj: any = {};
      sortObj[sort as string] = order === 'asc' ? 1 : -1;

      // Get total count for pagination
      const total = await Customer.countDocuments(query);

      // Fetch customers with pagination
      const customers = await Customer.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      // Enhance customer data with detailed stats
      const customersWithDetails = await Promise.all(
        customers.map(async (customer) => {
          // Get orders (limit to recent 20 for stats calculation, show only 5 in response)
          const orders = await Order.find({ userId: customer._id })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
          
          // Get wishlist with limited product details (only essential fields)
          const wishlist: any = await Wishlist.findOne({ userId: customer._id })
            .populate({
              path: 'items.productId',
              select: '_id name price images colorVariants'
            })
            .lean();
          
          // Get saved addresses for this customer (prioritize default address)
          const savedAddresses = await Address.find({ userId: customer._id })
            .sort({ isDefault: -1, createdAt: -1 })
            .lean();
          
          // Use saved address if available, otherwise use embedded address
          let displayAddress = customer.address;
          if (savedAddresses && savedAddresses.length > 0) {
            const primaryAddress = savedAddresses[0];
            displayAddress = {
              street: primaryAddress.address,
              city: primaryAddress.city,
              state: primaryAddress.state,
              pincode: primaryAddress.pincode,
              landmark: primaryAddress.locality
            };
          }
          
          // Calculate stats (revenue only from paid/confirmed orders)
          const paidStatuses = ['approved', 'processing', 'shipped', 'delivered'];
          const totalOrders = orders.length;
          const totalSpent = orders
            .filter(o => paidStatuses.includes(o.orderStatus as string))
            .reduce((sum, order) => sum + (order.total || 0), 0);
          const pendingOrders = orders.filter(o => o.orderStatus === 'pending').length;
          const completedOrders = orders.filter(o => o.orderStatus === 'delivered').length;
          const wishlistProducts = (wishlist && Array.isArray(wishlist.items))
            ? wishlist.items.map((item: any) => item.productId).filter(Boolean)
            : [];
          
          // Get name from most recent order's shipping address if profile name not set
          const shippingName = orders.length > 0 ? (orders[0].shippingAddress?.fullName || '') : '';

          return {
            _id: customer._id,
            phone: customer.phone,
            name: customer.name || '',
            shippingName,
            email: customer.email || '',
            dob: customer.dob,
            address: displayAddress,
            phoneVerified: customer.phoneVerified,
            notifyUpdates: customer.notifyUpdates,
            lastLogin: customer.lastLogin,
            createdAt: customer.createdAt,
            updatedAt: customer.updatedAt,
            stats: {
              totalOrders,
              totalSpent,
              pendingOrders,
              completedOrders,
              wishlistCount: wishlistProducts.length
            },
            recentOrders: orders.slice(0, 5).map(order => ({
              orderId: order._id,
              orderNumber: order.orderNumber,
              total: order.total,
              status: order.orderStatus,
              paymentStatus: order.paymentStatus,
              createdAt: order.createdAt
            })),
            wishlistItems: wishlistProducts
          };
        })
      );

      // Compute summary stats directly from orders (not per-customer rollup)
      // so unlinked/guest orders are included and the figure matches the dashboard
      const paidOrderStatuses = ['approved', 'processing', 'shipped', 'delivered'];
      const [revenueAgg, totalOrdersCount] = await Promise.all([
        Order.aggregate([
          { $match: { orderStatus: { $in: paidOrderStatuses } } },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        Order.countDocuments({})
      ]);
      const summaryRevenue = revenueAgg[0]?.total || 0;

      res.json({
        customers: customersWithDetails,
        summary: {
          totalRevenue: summaryRevenue,
          totalOrders: totalOrdersCount
        },
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a single customer by ID with full details
  app.get("/api/admin/customers/:id", authenticateAdmin, async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id).lean();
      if (!customer) return res.status(404).json({ error: 'Customer not found' });

      const orders = await Order.find({ userId: customer._id }).sort({ createdAt: -1 }).lean();
      const wishlist: any = await Wishlist.findOne({ userId: customer._id })
        .populate({ path: 'items.productId', select: 'name price images colorVariants' })
        .lean();
      const savedAddresses = await Address.find({ userId: customer._id }).sort({ isDefault: -1, createdAt: -1 }).lean();

      let displayAddress = (customer as any).address;
      if (savedAddresses && savedAddresses.length > 0) {
        const a = savedAddresses[0];
        displayAddress = { street: a.address, city: a.city, state: a.state, pincode: a.pincode, landmark: a.locality };
      }

      const wishlistProducts = (wishlist && Array.isArray(wishlist.items))
        ? wishlist.items.map((item: any) => item.productId).filter(Boolean)
        : [];

      res.json({
        _id: customer._id,
        phone: (customer as any).phone,
        name: (customer as any).name || '',
        email: (customer as any).email || '',
        dob: (customer as any).dob,
        address: displayAddress,
        phoneVerified: (customer as any).phoneVerified,
        notifyUpdates: (customer as any).notifyUpdates,
        lastLogin: (customer as any).lastLogin,
        createdAt: (customer as any).createdAt,
        updatedAt: (customer as any).updatedAt,
        stats: {
          totalOrders: orders.length,
          totalSpent: orders.reduce((s, o) => s + ((o as any).total || 0), 0),
          pendingOrders: orders.filter((o: any) => o.orderStatus === 'pending').length,
          completedOrders: orders.filter((o: any) => o.orderStatus === 'delivered').length,
          wishlistCount: wishlistProducts.length,
        },
        wishlistItems: wishlistProducts,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all orders for a specific customer (paginated, with full details)
  app.get("/api/admin/customers/:id/orders", authenticateAdmin, async (req, res) => {
    try {
      const { page = '1', limit = '10' } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const total = await Order.countDocuments({ userId: req.params.id });
      const orders = await Order.find({ userId: req.params.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      res.json({
        orders: orders.map((order: any) => ({
          orderId: order._id,
          orderNumber: order.orderNumber,
          items: order.items || [],
          total: order.total,
          subtotal: order.subtotal,
          shippingCharges: order.shippingCharges,
          tax: order.tax,
          discount: order.discount,
          status: order.orderStatus,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          shippingAddress: order.shippingAddress,
          createdAt: order.createdAt,
        })),
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/orders", authenticateAdmin, async (req, res) => {
    try {
      const {
        search,
        orderStatus,
        paymentStatus,
        startDate,
        endDate,
        sort = 'createdAt',
        order = 'desc',
        page = '1',
        limit = '20'
      } = req.query;

      const query: any = {};

      // Search by order number, customer name, email, or phone
      if (search) {
        const searchRegex = new RegExp(search as string, 'i');
        
        // Find users matching the search
        const matchingUsers = await User.find({
          $or: [
            { name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex }
          ]
        }).select('_id').lean();
        
        const userIds = matchingUsers.map(u => u._id);
        
        query.$or = [
          { orderNumber: searchRegex },
          { userId: { $in: userIds } }
        ];
      }

      // Filter by order status
      if (orderStatus) {
        const statuses = (orderStatus as string).split(',').filter(Boolean);
        query.orderStatus = statuses.length > 1 ? { $in: statuses } : statuses[0];
      }

      // Filter by payment status
      if (paymentStatus) {
        const statuses = (paymentStatus as string).split(',').filter(Boolean);
        query.paymentStatus = statuses.length > 1 ? { $in: statuses } : statuses[0];
      }

      // Filter by date range
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate as string);
        if (endDate) {
          const endDateTime = new Date(endDate as string);
          endDateTime.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDateTime;
        }
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const sortOrder = order === 'asc' ? 1 : -1;
      const sortObj: any = {};
      sortObj[sort as string] = sortOrder;

      const orders = await Order.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'name email phone')
        .populate('items.productId', 'name description images')
        .lean();

      const total = await Order.countDocuments(query);

      // Revenue: sum total only for paid/confirmed orders matching the current filters
      const paidStatusFilter = { ...query, orderStatus: { $in: ['approved', 'processing', 'shipped', 'delivered'] } };
      const revenueAgg = await Order.aggregate([
        { $match: paidStatusFilter },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      const totalRevenue = revenueAgg[0]?.total || 0;

      res.json({
        orders,
        totalRevenue,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/orders/:id", authenticateAdmin, async (req, res) => {
    try {
      const order = await Order.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('items.productId', 'name description images')
        .lean();
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/orders/:id/approve-only", authenticateAdmin, async (req, res) => {
    console.log('\n=== ORDER APPROVAL ONLY STARTED ===');
    console.log('Order ID:', req.params.id);
    console.log('Admin:', req.admin.username);
    console.log('Timestamp:', new Date().toISOString());
    
    try {
      const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
      
      if (!order) {
        console.error('❌ Order not found:', req.params.id);
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.approved) {
        console.error('❌ Order already approved');
        return res.status(400).json({ error: 'Order already approved' });
      }

      if (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') {
        console.error('❌ Payment not completed. Payment status:', order.paymentStatus);
        return res.status(400).json({ error: 'Prepaid orders must have payment completed before approval' });
      }

      order.approved = true;
      order.approvedBy = req.admin.username;
      order.approvedAt = new Date();
      order.orderStatus = 'approved';
      order.updatedAt = new Date();
      
      await order.save();

      console.log(`\n✅ Order ${order.orderNumber} approved (waiting for shipping partner)`);
      console.log('=== ORDER APPROVAL COMPLETED ===\n');

      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name email phone')
        .lean();

      // Send "Order Accepted" SMS
      try {
        const phoneForSms = (populatedOrder?.userId as any)?.phone || (populatedOrder?.shippingAddress as any)?.phone;
        const orderNum = (populatedOrder as any)?.orderNumber || String(order._id);
        if (phoneForSms) {
          await sendOrderAcceptedSMS(phoneForSms, orderNum);
        }
      } catch (smsErr) {
        console.error('Order accepted SMS failed:', smsErr);
      }

      res.json(populatedOrder);
    } catch (error: any) {
      console.error('\n❌ ORDER APPROVAL FAILED ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('=== END ERROR ===\n');
      res.status(500).json({ error: error.message || 'Failed to approve order' });
    }
  });

  app.post("/api/admin/orders/:id/send-to-shiprocket", authenticateAdmin, async (req, res) => {
    console.log('\n=== SENDING TO SHIPROCKET STARTED ===');
    console.log('Order ID:', req.params.id);
    console.log('Admin:', req.admin.username);
    console.log('Timestamp:', new Date().toISOString());
    
    try {
      const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
      
      if (!order) {
        console.error('❌ Order not found:', req.params.id);
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.shiprocketOrderId) {
        console.error('❌ Order already sent to Shiprocket');
        return res.status(400).json({ error: 'Order already sent to Shiprocket' });
      }

      // Auto-approve the order if not already approved
      if (!order.approved) {
        order.approved = true;
        order.approvedBy = req.admin.username;
        order.approvedAt = new Date();
        order.orderStatus = 'approved';
        console.log('✅ Auto-approving order before sending to ShipRocket');
      }

      const nameParts = order.shippingAddress.fullName.split(' ');
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || '';

      const orderItems = order.items.map((item: any, index: number) => ({
        name: item.name,
        sku: `SKU-${item.productId || index}`,
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0,
        hsn: 5208
      }));

      const totalWeight = order.items.reduce((sum: number, item: any) => sum + (item.quantity * 0.5), 0);

      const now = new Date();
      const orderDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const shiprocketOrderData = {
        order_id: order.orderNumber,
        order_date: orderDate,
        pickup_location: "Primary",
        billing_customer_name: firstName,
        billing_last_name: lastName,
        billing_address: order.shippingAddress.address,
        billing_city: order.shippingAddress.city,
        billing_pincode: order.shippingAddress.pincode,
        billing_state: order.shippingAddress.state,
        billing_country: "India",
        billing_email: (order.userId as any).email || "customer@ramanifashion.com",
        billing_phone: order.shippingAddress.phone,
        shipping_is_billing: true,
        order_items: orderItems,
        payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        sub_total: order.subtotal,
        length: 30,
        breadth: 25,
        height: 10,
        weight: totalWeight
      };

      console.log('\n📦 Sending order to Shiprocket:');
      console.log('Order Number:', shiprocketOrderData.order_id);
      console.log('Customer:', firstName, lastName);
      console.log('City:', shiprocketOrderData.billing_city);
      console.log('Pincode:', shiprocketOrderData.billing_pincode);
      console.log('Items:', orderItems.length);
      console.log('Payment Method:', shiprocketOrderData.payment_method);
      console.log('Weight:', totalWeight, 'kg');

      const shiprocketResponse = await shiprocketService.createOrder(shiprocketOrderData);
      
      console.log('\n✅ Shiprocket Response:');
      console.log('Order ID:', shiprocketResponse.order_id);
      console.log('Shipment ID:', shiprocketResponse.shipment_id);
      console.log('Status:', shiprocketResponse.status);

      order.orderStatus = 'processing';
      order.shiprocketOrderId = shiprocketResponse.order_id;
      order.shiprocketShipmentId = shiprocketResponse.shipment_id;
      order.updatedAt = new Date();
      
      await order.save();

      if (shiprocketResponse.shipment_id) {
        try {
          const awbResponse = await shiprocketService.assignAWB(shiprocketResponse.shipment_id);
          
          if (awbResponse.response?.data?.awb_code) {
            order.shiprocketAwbCode = awbResponse.response.data.awb_code;
            order.shiprocketCourierId = awbResponse.response.data.courier_company_id;
            order.shiprocketCourierName = awbResponse.response.data.courier_name;
            await order.save();

            try {
              await shiprocketService.schedulePickup(shiprocketResponse.shipment_id);
              console.log(`✅ Pickup scheduled for order ${order.orderNumber}`);
            } catch (pickupError: any) {
              console.error('Pickup scheduling failed (non-critical):', pickupError.message);
            }
          }
        } catch (awbError: any) {
          console.error('AWB assignment failed (non-critical):', awbError.message);
        }
      }

      console.log(`\n✅ Order ${order.orderNumber} sent to Shiprocket`);
      console.log('=== SENDING TO SHIPROCKET COMPLETED ===\n');

      // Send order confirmation notification to customer
      try {
        const customerPhone = order.shippingAddress.phone;
        const customerName = order.shippingAddress.fullName.split(' ')[0] || 'Customer';
        await sendOrderConfirmation(customerPhone, order.orderNumber, customerName);
        console.log('✅ Order confirmation sent to customer:', customerPhone);
      } catch (notificationError: any) {
        console.error('⚠️ Failed to send order confirmation:', notificationError.message);
      }

      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name email phone')
        .lean();

      res.json(populatedOrder);
    } catch (error: any) {
      console.error('\n❌ SENDING TO SHIPROCKET FAILED ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('=== END ERROR ===\n');
      res.status(500).json({ error: error.message || 'Failed to send to Shiprocket' });
    }
  });

  app.post("/api/admin/orders/:id/approve", authenticateAdmin, async (req, res) => {
    console.log('\n=== ORDER APPROVAL STARTED ===');
    console.log('Order ID:', req.params.id);
    console.log('Admin:', req.admin.username);
    console.log('Timestamp:', new Date().toISOString());
    
    try {
      const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
      
      if (!order) {
        console.error('❌ Order not found:', req.params.id);
        return res.status(404).json({ error: 'Order not found' });
      }

      console.log('Order found:', {
        orderNumber: order.orderNumber,
        approved: order.approved,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus
      });

      if (order.approved) {
        console.error('❌ Order already approved');
        return res.status(400).json({ error: 'Order already approved' });
      }

      if (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') {
        console.error('❌ Payment not completed. Payment status:', order.paymentStatus);
        return res.status(400).json({ error: 'Prepaid orders must have payment completed before approval' });
      }

      const nameParts = order.shippingAddress.fullName.split(' ');
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || '';

      const orderItems = order.items.map((item: any, index: number) => ({
        name: item.name,
        sku: `SKU-${item.productId || index}`,
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0,
        hsn: 5208
      }));

      const totalWeight = order.items.reduce((sum: number, item: any) => sum + (item.quantity * 0.5), 0);

      const now = new Date();
      const orderDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const shiprocketOrderData = {
        order_id: order.orderNumber,
        order_date: orderDate,
        pickup_location: "Primary",
        billing_customer_name: firstName,
        billing_last_name: lastName,
        billing_address: order.shippingAddress.address,
        billing_city: order.shippingAddress.city,
        billing_pincode: order.shippingAddress.pincode,
        billing_state: order.shippingAddress.state,
        billing_country: "India",
        billing_email: (order.userId as any).email || "customer@ramanifashion.com",
        billing_phone: order.shippingAddress.phone,
        shipping_is_billing: true,
        order_items: orderItems,
        payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        sub_total: order.subtotal,
        length: 30,
        breadth: 25,
        height: 10,
        weight: totalWeight
      };

      console.log('\n📦 Sending order to Shiprocket:');
      console.log('Order Number:', shiprocketOrderData.order_id);
      console.log('Customer:', firstName, lastName);
      console.log('City:', shiprocketOrderData.billing_city);
      console.log('Pincode:', shiprocketOrderData.billing_pincode);
      console.log('Items:', orderItems.length);
      console.log('Payment Method:', shiprocketOrderData.payment_method);
      console.log('Weight:', totalWeight, 'kg');

      const shiprocketResponse = await shiprocketService.createOrder(shiprocketOrderData);
      
      console.log('\n✅ Shiprocket Response:');
      console.log('Order ID:', shiprocketResponse.order_id);
      console.log('Shipment ID:', shiprocketResponse.shipment_id);
      console.log('Status:', shiprocketResponse.status);

      order.approved = true;
      order.approvedBy = req.admin.username;
      order.approvedAt = new Date();
      order.orderStatus = 'processing';
      order.shiprocketOrderId = shiprocketResponse.order_id;
      order.shiprocketShipmentId = shiprocketResponse.shipment_id;
      order.updatedAt = new Date();
      
      await order.save();

      if (shiprocketResponse.shipment_id) {
        try {
          const awbResponse = await shiprocketService.assignAWB(shiprocketResponse.shipment_id);
          
          if (awbResponse.response?.data?.awb_code) {
            order.shiprocketAwbCode = awbResponse.response.data.awb_code;
            order.shiprocketCourierId = awbResponse.response.data.courier_company_id;
            order.shiprocketCourierName = awbResponse.response.data.courier_name;
            await order.save();

            try {
              await shiprocketService.schedulePickup(shiprocketResponse.shipment_id);
              console.log(`✅ Pickup scheduled for order ${order.orderNumber}`);
            } catch (pickupError: any) {
              console.error('Pickup scheduling failed (non-critical):', pickupError.message);
            }
          }
        } catch (awbError: any) {
          console.error('AWB assignment failed (non-critical):', awbError.message);
        }
      }

      console.log(`\n✅ Order ${order.orderNumber} approved and sent to Shiprocket`);
      console.log('=== ORDER APPROVAL COMPLETED ===\n');

      // Send order confirmation notification to customer
      try {
        const customerPhone = order.shippingAddress.phone;
        const customerName = order.shippingAddress.fullName.split(' ')[0] || 'Customer';
        await sendOrderConfirmation(customerPhone, order.orderNumber, customerName);
        console.log('✅ Order confirmation sent to customer:', customerPhone);
      } catch (notificationError: any) {
        console.error('⚠️ Failed to send order confirmation:', notificationError.message);
        // Don't fail the entire request if notification fails
      }

      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name email phone')
        .lean();

      res.json(populatedOrder);
    } catch (error: any) {
      console.error('\n❌ ORDER APPROVAL FAILED ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('=== END ERROR ===\n');
      res.status(500).json({ error: error.message || 'Failed to approve order and create shipment' });
    }
  });

  app.post("/api/admin/orders/:id/reject", authenticateAdmin, async (req, res) => {
    try {
      const { reason } = req.body;
      const order = await Order.findById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.orderStatus === 'cancelled') {
        return res.status(400).json({ error: 'Order is already cancelled' });
      }

      if (order.orderStatus === 'delivered') {
        return res.status(400).json({ error: 'Cannot cancel an order that has already been delivered' });
      }

      order.orderStatus = 'cancelled';
      order.rejectedBy = req.admin.username;
      order.rejectedAt = new Date();
      order.rejectionReason = reason || 'No reason provided';
      order.updatedAt = new Date();
      
      await order.save();

      // Send "Order Cancellation" SMS
      try {
        const cancelledOrder = await Order.findById(order._id).populate('userId', 'phone');
        const phoneForSms = (cancelledOrder?.userId as any)?.phone
          || (cancelledOrder?.shippingAddress as any)?.phone
          || (order.shippingAddress as any)?.phone;
        const orderNum = (order as any).orderNumber || String(order._id);
        console.log(`[SMS] Order cancellation - orderNum: ${orderNum}, phone: ${phoneForSms || 'NOT FOUND'}`);
        if (phoneForSms) {
          await sendOrderCancelledSMS(phoneForSms, orderNum);
        } else {
          console.warn('[SMS] No phone number found for order cancellation SMS, skipping.');
        }
      } catch (smsErr) {
        console.error('Order cancellation SMS failed:', smsErr);
      }

      // Restore inventory for each item since the order was rejected
      for (const item of order.items) {
        try {
          const product = await Product.findById(item.productId);
          if (product) {
            (product as any).updatedAt = new Date();

            if (item.selectedSize && (product as any).category === 'BLOUSES') {
              // Restore per-variant blouseSize stock
              const matchedVariant = item.selectedColor
                ? (product as any).colorVariants?.find((v: any) => v.color === item.selectedColor)
                : (product as any).colorVariants?.[0];
              if (matchedVariant?.blouseSizes?.length) {
                const sizeEntry = matchedVariant.blouseSizes.find((s: any) => s.size === item.selectedSize);
                if (sizeEntry) {
                  sizeEntry.stockQuantity = (sizeEntry.stockQuantity || 0) + item.quantity;
                }
                const variantTotalStock = matchedVariant.blouseSizes.reduce(
                  (sum: number, s: any) => sum + (s.stockQuantity || 0), 0
                );
                matchedVariant.stockQuantity = variantTotalStock;
                matchedVariant.inStock = variantTotalStock > 0;
              } else if ((product as any).blouseSizes?.length > 0) {
                // fallback: global blouseSizes (legacy)
                const sizeEntry = (product as any).blouseSizes.find((s: any) => s.size === item.selectedSize);
                if (sizeEntry) sizeEntry.stockQuantity = (sizeEntry.stockQuantity || 0) + item.quantity;
              }
              // Recalculate product-level stock from all color variants
              if ((product as any).colorVariants?.length > 0) {
                const totalVariantStock = (product as any).colorVariants.reduce(
                  (sum: number, v: any) => sum + (v.stockQuantity || 0), 0
                );
                (product as any).stockQuantity = totalVariantStock;
                (product as any).inStock = totalVariantStock > 0;
              }
            } else if ((product as any).colorVariants?.length > 0) {
              // Restore the specific color variant
              const variant = item.selectedColor
                ? (product as any).colorVariants.find((v: any) => v.color === item.selectedColor)
                : null;
              if (variant) {
                variant.stockQuantity = (variant.stockQuantity || 0) + item.quantity;
                variant.inStock = variant.stockQuantity > 0;
              } else {
                for (const v of (product as any).colorVariants) {
                  v.stockQuantity = (v.stockQuantity || 0) + item.quantity;
                  v.inStock = v.stockQuantity > 0;
                }
              }
              const totalVariantStock = (product as any).colorVariants.reduce(
                (sum: number, v: any) => sum + (v.stockQuantity || 0), 0
              );
              (product as any).stockQuantity = totalVariantStock;
              (product as any).inStock = totalVariantStock > 0;
            } else {
              const newQty = ((product as any).stockQuantity || 0) + item.quantity;
              (product as any).stockQuantity = newQty;
              (product as any).inStock = newQty > 0;
            }

            await product.save();
          }
        } catch (invErr: any) {
          console.error(`Failed to restore inventory for product ${item.productId}:`, invErr.message);
        }
      }

      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name email phone')
        .lean();

      res.json(populatedOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/orders/:id/payment-status", authenticateAdmin, async (req, res) => {
    try {
      const { paymentStatus } = req.body;
      if (!['pending', 'paid', 'failed'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'Invalid payment status' });
      }
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      order.paymentStatus = paymentStatus;
      order.updatedAt = new Date();
      await order.save();
      const populatedOrder = await Order.findById(order._id).populate('userId', 'name email phone').lean();
      res.json(populatedOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/orders/:id/deliver", authenticateAdmin, async (req, res) => {
    try {
      const { paymentReceived = false } = req.body;
      const order = await Order.findById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (!order.approved) {
        return res.status(400).json({ error: 'Order must be approved before marking as delivered' });
      }

      if (order.orderStatus === 'delivered') {
        return res.status(400).json({ error: 'Order is already marked as delivered' });
      }

      if (order.orderStatus === 'cancelled') {
        return res.status(400).json({ error: 'Cannot mark a cancelled order as delivered' });
      }

      order.orderStatus = 'delivered';
      order.updatedAt = new Date();

      if (paymentReceived && order.paymentMethod === 'cod') {
        order.paymentStatus = 'paid';
      }
      
      await order.save();

      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name email phone')
        .lean();

      // Send "Order Delivered" SMS
      try {
        const phoneForSms = (populatedOrder?.userId as any)?.phone || (populatedOrder?.shippingAddress as any)?.phone;
        const orderNum = (populatedOrder as any)?.orderNumber || String(order._id);
        if (phoneForSms) {
          await sendOrderDeliveredSMS(phoneForSms, orderNum);
        }
      } catch (smsErr) {
        console.error('Order delivered SMS failed:', smsErr);
      }

      res.json(populatedOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/orders/:id/status", authenticateAdmin, async (req, res) => {
    try {
      const { orderStatus, paymentStatus } = req.body;
      
      const validOrderStatuses = ['pending', 'approved', 'processing', 'shipped', 'delivered', 'cancelled'];
      const validPaymentStatuses = ['pending', 'paid', 'failed'];
      
      if (orderStatus && !validOrderStatuses.includes(orderStatus)) {
        return res.status(400).json({ 
          error: `Invalid order status. Must be one of: ${validOrderStatuses.join(', ')}` 
        });
      }
      
      if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
        return res.status(400).json({ 
          error: `Invalid payment status. Must be one of: ${validPaymentStatuses.join(', ')}` 
        });
      }
      
      const order = await Order.findById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (orderStatus === 'processing' || orderStatus === 'shipped' || orderStatus === 'delivered') {
        if (!order.approved) {
          return res.status(400).json({ 
            error: 'Order must be approved before it can be processed, shipped, or delivered' 
          });
        }
      }

      const updateData: any = { updatedAt: new Date() };
      
      if (orderStatus) updateData.orderStatus = orderStatus;
      if (paymentStatus) updateData.paymentStatus = paymentStatus;

      const previousOrderStatus = order.orderStatus;

      const updatedOrder = await Order.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate('userId', 'name email phone');

      // Send SMS notifications based on status transitions
      try {
        const phoneForSms = (updatedOrder?.userId as any)?.phone || (updatedOrder?.shippingAddress as any)?.phone;
        const orderNum = (updatedOrder as any)?.orderNumber || String(req.params.id);
        if (phoneForSms && orderStatus && orderStatus !== previousOrderStatus) {
          if (orderStatus === 'shipped') {
            await sendOrderShippedSMS(phoneForSms, orderNum);
          } else if (orderStatus === 'delivered') {
            await sendOrderDeliveredSMS(phoneForSms, orderNum);
          } else if (orderStatus === 'cancelled') {
            await sendOrderCancelledSMS(phoneForSms, orderNum);
          } else if (orderStatus === 'approved') {
            await sendOrderAcceptedSMS(phoneForSms, orderNum);
          }
        }
        if (phoneForSms && paymentStatus && paymentStatus !== order.paymentStatus) {
          if (paymentStatus === 'paid') {
            await sendOrderConfirmationSMS(phoneForSms, orderNum);
          } else if (paymentStatus === 'failed') {
            await sendPaymentFailureSMS(phoneForSms, orderNum);
          }
        }
      } catch (smsErr) {
        console.error('Status update SMS notification failed:', smsErr);
      }
      
      res.json(updatedOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/inventory-duplicate-removed", authenticateAdmin, async (req, res) => {
    try {
      const products = await Product.find()
        .select('name category stockQuantity inStock price images colorVariants')
        .sort({ stockQuantity: 1 })
        .lean();
      
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/inventory/:id", authenticateAdmin, async (req, res) => {
    try {
      const { stockQuantity } = req.body;
      const inStock = stockQuantity > 0;
      
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { stockQuantity, inStock, updatedAt: new Date() },
        { new: true }
      );
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Sync stockQuantity to all colorVariants
      if (product.colorVariants && product.colorVariants.length > 0) {
        await Product.updateOne(
          { _id: req.params.id },
          { $set: { 'colorVariants.$[].stockQuantity': stockQuantity, 'colorVariants.$[].inStock': inStock } }
        );
      }

      const updated = await Product.findById(req.params.id).lean();
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/reviews", authenticateAdmin, async (req, res) => {
    try {
      const {
        search,
        productId,
        rating,
        verifiedOnly,
        sort = 'createdAt',
        order = 'desc',
        page = '1',
        limit = '50'
      } = req.query;

      const query: any = {};

      if (productId) {
        query.productId = productId;
      }

      if (rating) {
        query.rating = parseInt(rating as string);
      }

      if (verifiedOnly === 'true') {
        query.verifiedPurchase = true;
      }

      if (search) {
        const searchRegex = new RegExp(search as string, 'i');
        query.$or = [
          { customerName: searchRegex },
          { title: searchRegex },
          { comment: searchRegex }
        ];
      }

      const pageNum = parseInt(page as string);
      const limitNum = Math.min(parseInt(limit as string), 100);
      const skip = (pageNum - 1) * limitNum;

      const sortObj: any = {};
      sortObj[sort as string] = order === 'asc' ? 1 : -1;

      const total = await Review.countDocuments(query);

      const reviews = await Review.find(query)
        .populate('productId', 'name images category price')
        .populate('customerId', 'name email phone')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Calculate aggregate statistics across ALL matching reviews (not just current page)
      const allReviews = await Review.find(query).select('rating verifiedPurchase helpful').lean();
      const verifiedCount = allReviews.filter(r => r.verifiedPurchase).length;
      const avgRating = allReviews.length > 0 
        ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length 
        : 0;
      const totalHelpful = allReviews.reduce((sum, r) => sum + (r.helpful || 0), 0);

      res.json({
        reviews,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        },
        stats: {
          totalReviews: total,
          verifiedPurchases: verifiedCount,
          averageRating: avgRating,
          totalHelpfulVotes: totalHelpful
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/reviews/:id", authenticateAdmin, async (req, res) => {
    try {
      const review = await Review.findByIdAndDelete(req.params.id);
      
      if (!review) {
        return res.status(404).json({ error: 'Review not found' });
      }

      res.json({ success: true, message: 'Review deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/reviews", authenticateAdmin, async (req, res) => {
    try {
      const { productId, customerName, rating, title, comment, verifiedPurchase, photos } = req.body;
      if (!customerName || !rating || !title || !comment) {
        return res.status(400).json({ error: 'customerName, rating, title, and comment are required' });
      }
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }

      const reviewData: any = {
        customerName,
        rating: Number(rating),
        title,
        comment,
        verifiedPurchase: !!verifiedPurchase,
        photos: Array.isArray(photos) ? photos : [],
        adminCreated: true,
      };

      if (productId) {
        const product = await Product.findById(productId);
        if (product) reviewData.productId = productId;
      }

      const review = new Review(reviewData);
      await review.save();
      res.status(201).json(review);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/upload-review-image", authenticateAdmin, (req, res) => {
    upload.single("image")(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });
        const oldUrl = req.body.oldUrl || "";
        const url = await saveImageLocally(req.file.buffer, req.file.originalname, oldUrl);
        res.json({ url });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  // Hero Banner Routes
  app.get("/api/hero-banners", async (req, res) => {
    try {
      const banners = await HeroBanner.find({}).sort({ type: 1, order: 1 }).lean();
      const desktop = banners.filter((b: any) => b.type === 'desktop').map((b: any) => ({
        _id: b._id,
        url: `/media/hero-banners/${b.filename}`,
        order: b.order,
        categoryLink: b.categoryLink || '',
      }));
      const mobile = banners.filter((b: any) => b.type === 'mobile').map((b: any) => ({
        _id: b._id,
        url: `/media/hero-banners/${b.filename}`,
        order: b.order,
        categoryLink: b.categoryLink || '',
      }));
      res.json({ desktop, mobile });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/hero-banners/:id", authenticateAdmin, async (req, res) => {
    try {
      const { categoryLink } = req.body;
      const banner = await HeroBanner.findByIdAndUpdate(
        req.params.id,
        { categoryLink: categoryLink || '' },
        { new: true }
      ).lean();
      if (!banner) return res.status(404).json({ error: 'Banner not found' });
      res.json({ success: true, banner });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/hero-banners/upload", authenticateAdmin, (req, res) => {
    mediaUpload.fields([
      { name: 'image', maxCount: 1 },
    ])(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      try {
        const files = req.files as any;
        const type = req.body.type as string;
        if (!type || !['desktop', 'mobile'].includes(type)) {
          return res.status(400).json({ error: 'type must be desktop or mobile' });
        }
        if (!files.image || !files.image[0]) {
          return res.status(400).json({ error: 'No image provided' });
        }

        const heroBannersDir = 'public/media/hero-banners';
        if (!fs.existsSync(heroBannersDir)) {
          fs.mkdirSync(heroBannersDir, { recursive: true });
        }

        const ext = path.extname(files.image[0].originalname).toLowerCase() || '.png';
        const filename = `${type}-${Date.now()}${ext}`;
        const destPath = `${heroBannersDir}/${filename}`;
        fs.copyFileSync(files.image[0].path, destPath);
        fs.unlinkSync(files.image[0].path);

        const count = await HeroBanner.countDocuments({ type });
        const categoryLink = req.body.categoryLink || '';
        const banner = new HeroBanner({ type, filename, order: count, categoryLink });
        await banner.save();

        res.json({ success: true, banner: { _id: banner._id, url: `/media/hero-banners/${filename}`, order: banner.order, categoryLink: banner.categoryLink } });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  app.delete("/api/admin/hero-banners/:id", authenticateAdmin, async (req, res) => {
    try {
      const banner = await HeroBanner.findByIdAndDelete(req.params.id);
      if (!banner) return res.status(404).json({ error: 'Banner not found' });

      const filePath = `public/media/hero-banners/${banner.filename}`;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Announcement Bar Routes
  app.get("/api/announcement-bar", async (req, res) => {
    try {
      const items = await AnnouncementBar.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/announcement-bar", authenticateAdmin, async (req, res) => {
    try {
      const items = await AnnouncementBar.find().sort({ order: 1, createdAt: 1 });
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/announcement-bar", authenticateAdmin, async (req, res) => {
    try {
      const { text, isActive, order } = req.body;
      if (!text || !text.trim()) return res.status(400).json({ error: "Text is required" });
      const item = await AnnouncementBar.create({ text: text.trim(), isActive: isActive !== false, order: order ?? 0 });
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/announcement-bar/:id", authenticateAdmin, async (req, res) => {
    try {
      const { text, isActive, order } = req.body;
      const item = await AnnouncementBar.findByIdAndUpdate(
        req.params.id,
        { text: text?.trim(), isActive, order },
        { new: true }
      );
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/announcement-bar/:id", authenticateAdmin, async (req, res) => {
    try {
      await AnnouncementBar.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Settings Routes
  app.get("/api/settings", async (req, res) => {
    try {
      let settings = await Settings.findOne();
      
      if (!settings) {
        settings = await Settings.create({
          shippingCharges: 0,
          freeShippingThreshold: 999
        });
      }
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/home-circles", async (req, res) => {
    try {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = await Settings.create({ shippingCharges: 0, freeShippingThreshold: 999 });
      }
      res.json({ homeCircles: settings.homeCircles || [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/home-circles", authenticateAdmin, async (req, res) => {
    try {
      const { homeCircles } = req.body;
      if (!Array.isArray(homeCircles)) {
        return res.status(400).json({ error: 'homeCircles must be an array' });
      }
      let settings = await Settings.findOne();
      if (!settings) {
        settings = await Settings.create({ shippingCharges: 0, freeShippingThreshold: 999 });
      }
      settings.homeCircles = homeCircles;
      settings.markModified('homeCircles');
      settings.updatedAt = new Date();
      await settings.save();
      res.json({ homeCircles: settings.homeCircles });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/settings", authenticateAdmin, async (req, res) => {
    try {
      let settings = await Settings.findOne();
      
      if (!settings) {
        settings = await Settings.create({
          shippingCharges: 0,
          freeShippingThreshold: 999
        });
      }
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/settings", authenticateAdmin, async (req, res) => {
    try {
      const { shippingCharges, freeShippingThreshold } = req.body;
      
      if (shippingCharges !== undefined && shippingCharges < 0) {
        return res.status(400).json({ error: 'Shipping charges cannot be negative' });
      }
      
      if (freeShippingThreshold !== undefined && freeShippingThreshold < 0) {
        return res.status(400).json({ error: 'Free shipping threshold cannot be negative' });
      }
      
      let settings = await Settings.findOne();
      
      if (!settings) {
        settings = await Settings.create({
          shippingCharges: shippingCharges ?? 0,
          freeShippingThreshold: freeShippingThreshold ?? 999,
          updatedBy: req.admin.username,
          updatedAt: new Date()
        });
      } else {
        if (shippingCharges !== undefined) settings.shippingCharges = shippingCharges;
        if (freeShippingThreshold !== undefined) settings.freeShippingThreshold = freeShippingThreshold;
        settings.updatedBy = req.admin.username;
        settings.updatedAt = new Date();
        await settings.save();
      }
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/settings/homepage-visibility", authenticateAdmin, async (req, res) => {
    try {
      const { showRamaniBanner, showPromotionalVideo } = req.body;
      let settings = await Settings.findOne();
      if (!settings) {
        settings = await Settings.create({ shippingCharges: 0, freeShippingThreshold: 999 });
      }
      if (showRamaniBanner !== undefined) settings.showRamaniBanner = showRamaniBanner;
      if (showPromotionalVideo !== undefined) settings.showPromotionalVideo = showPromotionalVideo;
      settings.updatedAt = new Date();
      await settings.save();
      res.json({ showRamaniBanner: settings.showRamaniBanner, showPromotionalVideo: settings.showPromotionalVideo });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Media Upload Route - for hero banner, ramani banner, and video
  app.post("/api/admin/upload-media", authenticateAdmin, (req, res) => {
    mediaUpload.fields([
      { name: 'hero', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
      { name: 'video', maxCount: 1 }
    ])(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large (max 100MB per file)' });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }

      try {
        const files = req.files as any;
        const uploadedFiles: any = {};

        if (files.hero && files.hero[0]) {
          const heroPath = 'public/media/hero-banner.png';
          fs.copyFileSync(files.hero[0].path, heroPath);
          fs.unlinkSync(files.hero[0].path);
          uploadedFiles.hero = '/media/hero-banner.png';
        }

        if (files.banner && files.banner[0]) {
          const bannerPath = 'public/media/ramani-banner.png';
          fs.copyFileSync(files.banner[0].path, bannerPath);
          fs.unlinkSync(files.banner[0].path);
          uploadedFiles.banner = '/media/ramani-banner.png';
        }

        if (files.video && files.video[0]) {
          const videoPath = 'public/media/promotional-video.mp4';
          fs.copyFileSync(files.video[0].path, videoPath);
          fs.unlinkSync(files.video[0].path);
          uploadedFiles.video = '/media/promotional-video.mp4';
        }

        res.json({
          success: true,
          files: uploadedFiles,
          message: 'Media uploaded successfully'
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
