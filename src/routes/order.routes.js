const express = require('express');
const router = express.Router();
const orderCtrl = require('../controllers/order.controller');
const authenticate = require('../middlewares/auth');
const roleCheck = require('../middlewares/roleCheck');
const Order = require('../models/Order');


router.post('/', authenticate, roleCheck(['buyer']), orderCtrl.createOrder);
router.get('/', authenticate, orderCtrl.listOrdersByUser);
router.put('/:id', authenticate, orderCtrl.updateOrderStatus);
router.get('/:id/invoice', authenticate, roleCheck(['buyer']), orderCtrl.downloadInvoice);

module.exports = router;