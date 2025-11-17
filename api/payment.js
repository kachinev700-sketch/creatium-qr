const API_KEY = "ZFH3I83C.tqQSB88JCwZwQKulPaM6JxbavGYGTm2Q";

module.exports = async (req, res) => {
  console.log('=== CREATIUM QR PAYMENT HANDLER ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  // Настраиваем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Обрабатываем OPTIONS запрос
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔥 ОБРАБОТКА POST ОТ CREATIUM
  if (req.method === 'POST') {
    try {
      let body = '';
      
      // Читаем тело запроса
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('Raw body length:', body.length);

      let data = {};
      if (body) {
        data = JSON.parse(body);
      }
      
      console.log('Raw payment amount:', data.payment?.amount);
      console.log('Raw cart subtotal:', data.cart?.subtotal);

      // 🔥 ИСПРАВЛЕННЫЙ РАСЧЕТ СУММЫ
      let amountInRub = 100; // сумма в рублях для отображения
      let amountForQR = 10000; // сумма в копейках для QR-кода
      
      if (data.payment && data.payment.amount) {
        // Получаем сумму в рублях из Creatium
        amountInRub = parseFloat(data.payment.amount);
        console.log('Amount in RUB from payment:', amountInRub);
        
        // 🔥 ПРЕОБРАЗУЕМ РУБЛИ В КОПЕЙКИ ДЛЯ QR-КОДА
        amountForQR = Math.round(amountInRub * 100);
        console.log('Amount in kopecks for QR:', amountForQR);
        
      } else if (data.cart && data.cart.subtotal) {
        // Если subtotal уже число, используем как есть
        amountInRub = data.cart.subtotal;
        amountForQR = Math.round(amountInRub * 100);
        console.log('Amount from cart - RUB:', amountInRub, 'Kopecks:', amountForQR);
      }

      console.log('Final amounts - Display:', amountInRub, 'RUB, QR:', amountForQR, 'kopecks');

      // 🔥 ГЕНЕРИРУЕМ QR КОД С СУММОЙ В КОПЕЙКАХ
      const payload = {
        sum: amountForQR, // 🔥 ОТПРАВЛЯЕМ СУММУ В КОПЕЙКАХ
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода",
        notification_url: "https://perevod-rus.ru/callback/"
      };

      console.log('Sending to QR service with payload:', payload);

      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!qrResponse.ok) {
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      console.log('QR generated successfully');

      // 🔥 СОЗДАЕМ HTML ФОРМУ (показываем сумму в рублях)
      const htmlForm = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Оплата заказа</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            text-align: center;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 20px;
        }
        .amount {
            font-size: 32px;
            font-weight: bold;
            color: #27ae60;
            margin: 20px 0;
        }
        .amount-info {
            background: #e3f2fd;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-size: 14px;
            color: #1976d2;
        }
        .qr-code {
            max-width: 100%;
            border: 2px solid #3498db;
            border-radius: 10px;
            padding: 10px;
            background: white;
        }
        .instructions {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>💳 Оплата заказа</h1>
        
        <!-- Информация о сумме -->
        <div class="amount-info">
            <strong>Сумма к оплате:</strong>
        </div>
        
        <div class="amount">${amountInRub} руб.</div>
        
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        
        <div class="instructions">
            <strong>Как оплатить:</strong><br>
            1. Откройте приложение вашего банка<br>
            2. Наведите камеру на QR-код<br>
            3. Подтвердите оплату ${amountInRub} руб.<br>
            4. Дождитесь уведомления
        </div>
    </div>
</body>
</html>
      `;

      const response = {
        success: true,
        form: htmlForm,
        url: `https://creatium-qr.vercel.app/?sum=${amountInRub}`,
        amount: amountInRub,
        order_id: data.order?.id,
        payment_id: data.payment?.id
      };

      console.log('Returning response with amount:', amountInRub, 'RUB');
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(response);

    } catch (error) {
      console.error('Error processing payment:', error);
      
      const errorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ошибка</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
  <h2 style="color: #e74c3c;">❌ Ошибка оплаты</h2>
  <p>${error.message}</p>
</body>
</html>
      `;
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        success: false,
        error: error.message,
        form: errorHtml
      });
    }
  }

  // 🔥 ОБРАБОТКА GET ЗАПРОСА (прямой доступ к странице оплаты)
  if (req.method === 'GET') {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum') || '100';
      const order_id = urlParams.get('order_id');

      console.log('Direct GET request:', { sum, order_id });

      // 🔥 ДЛЯ GET ТАКЖЕ ПРЕОБРАЗУЕМ В КОПЕЙКИ
      const amountInRub = parseFloat(sum);
      const amountForQR = Math.round(amountInRub * 100);

      console.log('GET amounts - Display:', amountInRub, 'RUB, QR:', amountForQR, 'kopecks');

      const payload = {
        sum: amountForQR, // 🔥 ОТПРАВЛЯЕМ СУММУ В КОПЕЙКАХ
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода", 
        notification_url: "https://perevod-rus.ru/callback/"
      };

      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      const qrResult = await qrResponse.json();

      const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Оплата ${amountInRub} руб.</title>
    <style>
        body { 
            font-family: Arial; 
            text-align: center; 
            padding: 50px; 
            background: #f5f5f5; 
        }
        .container { 
            background: white; 
            padding: 30px; 
            border-radius: 15px; 
            display: inline-block;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        h2 { 
            color: #333; 
            margin-bottom: 20px;
        }
        .amount { 
            color: #27ae60; 
            font-size: 28px; 
            font-weight: bold; 
            margin: 20px 0; 
        }
        .qr-code { 
            max-width: 300px; 
            border: 3px solid #3498db; 
            border-radius: 10px; 
            padding: 10px;
            background: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>💳 Оплата заказа</h2>
        ${order_id ? `<div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; color: #1976d2;">Заказ #${order_id}</div>` : ''}
        
        <div class="amount">${amountInRub} руб.</div>
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        <div style="margin-top: 20px; color: #666;">
            Отсканируйте QR-код для оплаты ${amountInRub} руб.
        </div>
    </div>
</body>
</html>
      `;

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);

    } catch (error) {
      console.error('GET Error:', error);
      
      const errorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ошибка</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
  <h2>❌ Ошибка</h2>
  <p>${error.message}</p>
</body>
</html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(errorHtml);
    }
  }

  return res.status(405).json({
    error: 'Method not allowed'
  });
};
