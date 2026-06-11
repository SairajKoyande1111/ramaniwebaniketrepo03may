import mongoose, { Schema, Model } from 'mongoose';

// Product Schema
const productSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  subDescription: { type: String },
  detailedDescription: { type: String },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  images: [{ type: String }],
  category: { type: String, required: true },
  subcategory: { type: String },
  fabric: { type: String },
  color: { type: String },
  colorVariants: {
    type: [{
      color: { type: String, required: true },
      colorHex: { type: String },
      images: { 
        type: [{ type: String, required: true }],
        validate: {
          validator: function(v: string[]) {
            return v && v.length >= 1 && v.length <= 5 && v.every(url => url && url.trim().length > 0);
          },
          message: 'Each color variant must have between 1 and 5 non-empty image URLs'
        }
      },
      sku: { type: String },
      stockQuantity: { type: Number, default: 0 },
      inStock: { type: Boolean, default: true },
      isActive: { type: Boolean, default: true },
      isNew: { type: Boolean, default: false },
      isBestseller: { type: Boolean, default: false },
      isTrending: { type: Boolean, default: false },
      blouseSizes: {
        type: [{
          size: { type: String, required: true },
          stockQuantity: { type: Number, default: 0 },
        }],
        default: [],
      },
    }],
    validate: {
      validator: function(v: any[]) {
        return v && v.length >= 1;
      },
      message: 'Product must have at least one color variant'
    }
  },
  blouseSizes: {
    type: [{
      size: { type: String, required: true },
      stockQuantity: { type: Number, default: 0 },
    }],
    default: [],
  },
  occasion: { type: String },
  pattern: { type: String },
  workType: { type: String },
  blousePiece: { type: Boolean, default: false },
  sareeLength: { type: String },
  inStock: { type: Boolean, default: true },
  stockQuantity: { type: Number, default: 0 },
  isNew: { type: Boolean, default: false },
  isBestseller: { type: Boolean, default: false },
  isTrending: { type: Boolean, default: false },
  onSale: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 9999 },
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  specifications: {
    fabricComposition: String,
    dimensions: String,
    weight: String,
    careInstructions: String,
    countryOfOrigin: String,
    material: String,
    plating: String,
    stoneType: String,
    setIncludes: String,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

productSchema.index({ name: 'text', description: 'text' });

// User Schema (for Admin)
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  phoneVerified: { type: Boolean, default: false },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now },
});

// Customer Schema (for phone-based OTP login)
const customerSchema = new Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String },
  email: { type: String },
  dob: { type: Date },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
  },
  phoneVerified: { type: Boolean, default: false },
  notifyUpdates: { type: Boolean, default: false },
  lastLogin: { type: Date },
  wishlist: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    addedAt: { type: Date, default: Date.now },
  }],
  cart: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 },
    addedAt: { type: Date, default: Date.now },
  }],
  orders: [{
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    total: Number,
    status: String,
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// OTP Schema for temporary storage (dummy implementation)
const otpSchema = new Schema({
  phone: { type: String, required: true },
  otp: { type: String, required: true },
  verified: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Address Schema
const addressSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  pincode: { type: String, required: true },
  address: { type: String, required: true },
  locality: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  landmark: { type: String },
  addressType: { type: String, enum: ['home', 'office'], default: 'home' },
  isDefault: { type: Boolean, default: false },
});

// Cart Schema
const cartSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, default: 1 },
    selectedColor: { type: String, default: null },
    selectedSize: { type: String, default: null },
    addedAt: { type: Date, default: Date.now },
  }],
  updatedAt: { type: Date, default: Date.now },
});

// Wishlist Schema
const wishlistSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    selectedColor: { type: String, default: null },
  }],
  updatedAt: { type: Date, default: Date.now },
});

// Order Schema
const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  orderNumber: { type: String, required: true, unique: true },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    image: { type: String },
    selectedColor: { type: String, default: null },
    selectedSize: { type: String, default: null },
  }],
  shippingAddress: {
    fullName: String,
    phone: String,
    address: String,
    locality: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
  },
  subtotal: { type: Number, required: true },
  shippingCharges: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  orderStatus: { type: String, enum: ['pending', 'approved', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  approved: { type: Boolean, default: false },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  inventoryDeducted: { type: Boolean, default: false },
  phonePeTransactionId: { type: String },
  phonePeMerchantOrderId: { type: String },
  phonePeOrderId: { type: String },
  phonePePaymentState: { type: String },
  phonePePaymentDetails: { type: Schema.Types.Mixed },
  shiprocketOrderId: { type: Number },
  shiprocketShipmentId: { type: Number },
  shiprocketAwbCode: { type: String },
  shiprocketCourierId: { type: Number },
  shiprocketCourierName: { type: String },
  shiprocketLabelUrl: { type: String },
  shiprocketTrackingUrl: { type: String },
  rejectedBy: { type: String },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  refundStatus: { type: String, enum: ['na', 'pending', 'done'], default: 'na' },
  refundNote: { type: String },
  refundDoneAt: { type: Date },
  refundDoneBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Contact Submission Schema
const contactSubmissionSchema = new Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  category: { type: String, required: true },
  message: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Sync helper functions to keep Customer embedded arrays in sync with authoritative collections
async function syncCustomerCart(customerId: any) {
  try {
    const CustomerModel = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
    const CartModel = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
    
    const cart = await CartModel.findOne({ userId: customerId });
    const cartItems = cart?.items.map((item: any) => ({
      productId: item.productId,
      quantity: item.quantity,
      selectedColor: item.selectedColor,
      addedAt: item.addedAt
    })) || [];
    
    await CustomerModel.findByIdAndUpdate(customerId, {
      cart: cartItems,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error syncing customer cart:', error);
  }
}

async function syncCustomerWishlist(customerId: any) {
  try {
    const CustomerModel = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
    const WishlistModel = mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);
    
    const wishlist = await WishlistModel.findOne({ userId: customerId });
    const wishlistItems = wishlist?.items.map((item: any) => ({
      productId: item.productId,
      addedAt: wishlist.updatedAt || new Date()
    })) || [];
    
    await CustomerModel.findByIdAndUpdate(customerId, {
      wishlist: wishlistItems,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error syncing customer wishlist:', error);
  }
}

async function syncCustomerOrders(customerId: any) {
  try {
    const CustomerModel = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
    const OrderModel = mongoose.models.Order || mongoose.model('Order', orderSchema);
    
    const orders = await OrderModel.find({ userId: customerId }).sort({ createdAt: -1 }).limit(20);
    const orderItems = orders.map((order: any) => ({
      orderId: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      status: order.orderStatus,
      createdAt: order.createdAt
    }));
    
    await CustomerModel.findByIdAndUpdate(customerId, {
      orders: orderItems,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error syncing customer orders:', error);
  }
}

// Add Mongoose middleware hooks to auto-sync embedded customer arrays

// Cart hooks
cartSchema.post('save', async function(doc) {
  if (doc.userId) {
    await syncCustomerCart(doc.userId);
  }
});

cartSchema.post('findOneAndUpdate', async function(doc) {
  if (doc?.userId) {
    await syncCustomerCart(doc.userId);
  }
});

cartSchema.post('findOneAndDelete', async function(doc) {
  if (doc?.userId) {
    await syncCustomerCart(doc.userId);
  }
});

// Wishlist hooks
wishlistSchema.post('save', async function(doc) {
  if (doc.userId) {
    await syncCustomerWishlist(doc.userId);
  }
});

wishlistSchema.post('findOneAndUpdate', async function(doc) {
  if (doc?.userId) {
    await syncCustomerWishlist(doc.userId);
  }
});

wishlistSchema.post('findOneAndDelete', async function(doc) {
  if (doc?.userId) {
    await syncCustomerWishlist(doc.userId);
  }
});

// Order hooks
orderSchema.post('save', async function(doc) {
  if (doc.userId) {
    await syncCustomerOrders(doc.userId);
  }
});

orderSchema.post('findOneAndUpdate', async function(doc) {
  if (doc?.userId) {
    await syncCustomerOrders(doc.userId);
  }
});

orderSchema.post('findOneAndDelete', async function(doc) {
  if (doc?.userId) {
    await syncCustomerOrders(doc.userId);
  }
});

orderSchema.post('deleteMany', async function() {
  // For bulk deletes, we need to sync all affected customers
  // This is a catch-all to ensure consistency
  const query = this.getFilter();
  if (query.userId) {
    await syncCustomerOrders(query.userId);
  }
});

// Review Schema
const reviewSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true },
  comment: { type: String, required: true },
  verifiedPurchase: { type: Boolean, default: false },
  helpful: { type: Number, default: 0 },
  helpfulVotes: [{ type: Schema.Types.ObjectId, ref: 'Customer' }],
  photos: { type: [String], default: [] },
  adminCreated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Hero Banner Schema
const heroBannerSchema = new Schema({
  type: { type: String, enum: ['desktop', 'mobile'], required: true },
  filename: { type: String, required: true },
  order: { type: Number, default: 0 },
  categoryLink: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

// Index for faster queries
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ customerId: 1 });

// Function to update product rating and review count
async function updateProductRating(productId: any) {
  const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);
  const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
  
  const reviews = await Review.find({ productId });
  const reviewCount = reviews.length;
  const rating = reviewCount > 0 
    ? reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviewCount 
    : 0;
  
  await Product.findByIdAndUpdate(productId, {
    rating: Math.round(rating * 10) / 10, // Round to 1 decimal place
    reviewCount,
  });
}

// Review hooks to update product rating
reviewSchema.post('save', async function(doc) {
  if (doc.productId) await updateProductRating(doc.productId);
});

reviewSchema.post('findOneAndUpdate', async function(doc) {
  if (doc?.productId) {
    await updateProductRating(doc.productId);
  }
});

reviewSchema.post('findOneAndDelete', async function(doc) {
  if (doc?.productId) {
    await updateProductRating(doc.productId);
  }
});

reviewSchema.post('deleteMany', async function() {
  const query = this.getFilter();
  if (query.productId) {
    await updateProductRating(query.productId);
  }
});

// Settings Schema (for configurable app settings)
const settingsSchema = new Schema({
  shippingCharges: { type: Number, default: 0 },
  freeShippingThreshold: { type: Number, default: 999 },
  homeCircles: { type: [Schema.Types.Mixed], default: [] },
  showRamaniBanner: { type: Boolean, default: true },
  showPromotionalVideo: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String },
});

// Admin User Schema
const adminUserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now },
});

// Category Schema – supports unlimited recursive sub-category nesting via Mixed
const categorySchema = new Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  image: { type: String, default: '' },
  // Each element here is a plain object with the same shape (name, slug, image, subCategories[])
  subCategories: { type: [Schema.Types.Mixed], default: [] },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Announcement Bar Schema
const announcementBarSchema = new Schema({
  text: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Export models
export const AnnouncementBar = mongoose.models.AnnouncementBar || mongoose.model('AnnouncementBar', announcementBarSchema);
export const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema);
export const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
export const Address = mongoose.models.Address || mongoose.model('Address', addressSchema);
export const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
export const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);
export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export const ContactSubmission = mongoose.models.ContactSubmission || mongoose.model('ContactSubmission', contactSubmissionSchema);
export const OTP = mongoose.models.OTP || mongoose.model('OTP', otpSchema);
export const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);
export const HeroBanner = mongoose.models.HeroBanner || mongoose.model('HeroBanner', heroBannerSchema);
export const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
