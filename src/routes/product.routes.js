const express = require('express');
const router = express.Router();
const prodCtrl = require('../controllers/product.controller');
const authenticate = require('../middlewares/auth');
const roleCheck = require('../middlewares/roleCheck');
const upload = require('../middlewares/upload');
const { uploadImages } = require('../controllers/product.controller');

router.get('/', prodCtrl.listProducts);
router.get('/:id', prodCtrl.getProduct);
router.post('/:id/reviews', authenticate, roleCheck(['buyer']), prodCtrl.addProductReview);
router.get('/:id/reviews', prodCtrl.getProductReviews);

// Seller-only
router.post('/', authenticate, roleCheck(['seller']), prodCtrl.createProduct);
router.put('/:id', authenticate, roleCheck(['seller']), prodCtrl.updateProduct);
router.delete('/:id', authenticate, roleCheck(['seller']), prodCtrl.deleteProduct);
router.post(
  '/upload-images',
  authenticate,
  roleCheck(['seller']),
  (req, res, next) => {
    upload.array("images", 6)(req, res, (err) => {
      if (err) {
        console.error("upload-images error:", err);
        return res
          .status(400)
          .json({ message: "Image upload failed", error: err.message });
      }
      next();
    });
  },
  uploadImages
);

module.exports = router;