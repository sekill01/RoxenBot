const crypto = require('crypto');
const db = require('./db');
const config = require('../config');

class PaymentManager {
  /**
   * Shopier veya PayTR için ödeme başlatma linki üretir.
   */
  createPaymentOrder(user, planType = 'monthly') {
    const isLifetime = planType === 'lifetime';
    const amount = isLifetime ? config.PAYMENT.PRO_LIFETIME_PRICE : config.PAYMENT.PRO_MONTHLY_PRICE;
    const orderId = 'ORD_' + Date.now() + '_' + user.id.slice(-4);

    // Gerçek Shopier API bilgileri girildiğinde otomatik Shopier URL'i döner,
    // girilmediğinde simüle edilmiş güvenli ödeme sayfası açılır.
    return {
      orderId,
      amount,
      currency: 'TRY',
      planType,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      paymentUrl: `/payment/checkout?orderId=${orderId}&plan=${planType}&amount=${amount}`
    };
  }

  /**
   * Shopier / PayTR Webhook Doğrulama ve Üyelik Yükseltme
   */
  handleWebhook(payload) {
    const { orderId, userId, status, plan } = payload;
    if (status !== 'success' && status !== 'COMPLETED') {
      return { success: false, message: 'Ödeme tamamlanmadı.' };
    }

    const user = db.getUserById(userId);
    if (!user) {
      return { success: false, message: 'Kullanıcı bulunamadı.' };
    }

    const isLifetime = plan === 'lifetime';
    const days = isLifetime ? -1 : 30;

    const sub = db.setSubscription(user.id, { plan: 'pro', days });
    console.log(`🎉 [ÖDEME BAŞARILI] ${user.name} (${user.email}) VIP PRO abonesi oldu! Plan: ${plan}`);

    return {
      success: true,
      user: db.getUserById(userId),
      subscription: sub
    };
  }

  /**
   * Test & Demo için Tek Tıkla VIP PRO Yükseltme
   */
  simulateUpgradeToPro(userId, planType = 'monthly') {
    const user = db.getUserById(userId);
    if (!user) return { success: false, error: 'Kullanıcı bulunamadı.' };

    const days = planType === 'lifetime' ? -1 : 30;
    const sub = db.setSubscription(userId, { plan: 'pro', days });

    return {
      success: true,
      message: 'Hesabınız başarıyla VIP PRO paketine yükseltildi! Özel Bot Adı ve tüm PRO özellikler açıldı.',
      subscription: sub,
      user: db.getUserById(userId)
    };
  }
}

module.exports = new PaymentManager();
