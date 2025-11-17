const API_KEY = "ZFH3I83C.tqQSB88JCwZwQKulPaM6JxbavGYGTm2Q";

module.exports = async (req, res) => {
  // Настраиваем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
      
      const data = JSON.parse(body);
      
      // Извлекаем сумму из данных Creatium
      let amount = 100;
      if (data.payment && data.payment.amount) {
        amount = parseFloat(data.payment.amount);
      } else if (data.cart && data.cart.subtotal) {
        amount = data.cart.subtotal;
      }

      // 🔥 ГЕНЕРИРУЕМ QR КОД
      const payload = {
        sum: amount,
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

      if (!qrResponse.ok) {
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();

      // 🔥 ВОЗВРАЩАЕМ HTML ФОРМУ ДЛЯ CREATIUM
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
        .security {
            background: #e8f5e8;
            color: #2e7d32;
            padding: 10px;
            border-radius: 5px;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>💳 Оплата заказа</h1>
        <div class="security">🔒 Безопасное соединение</div>
        
        <div class="amount">${amount} руб.</div>
        
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        
        <div class="instructions">
            <strong>Как оплатить:</strong><br>
            1. Откройте приложение вашего банка<br>
            2. Наведите камеру на QR-код<br>
            3. Подтвердите оплату
        </div>
    </div>
</body>
</html>
      `;

      return res.status(200).json({
        form: htmlForm,
        success: true,
        amount: amount
      });

    } catch (error) {
      const errorForm = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ошибка</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
  <h2 style="color: #e74c3c;">❌ Ошибка оплаты</h2>
  <p>${error.message}</p>
</body>
</html>
      `;
      
      return res.status(200).json({
        form: errorForm,
        success: false,
        error: error.message
      });
    }
  }

  // 🔥 ОБРАБОТКА GET ЗАПРОСА
  if (req.method === 'GET') {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum') || '100';

      // Генерируем QR код
      const payload = {
        sum: parseFloat(sum),
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
    <title>Оплата ${sum} руб.</title>
    <style>
        body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 15px; display: inline-block; }
        h2 { color: #333; }
        .amount { color: #27ae60; font-size: 24px; font-weight: bold; margin: 20px 0; }
        .qr-code { max-width: 300px; border: 2px solid #3498db; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>💳 Оплата</h2>
        <div class="amount">${sum} руб.</div>
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        <div style="margin-top: 20px; color: #666;">
            Отсканируйте QR-код для оплаты
        </div>
    </div>
</body>
</html>
      `;

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);

    } catch (error) {
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
