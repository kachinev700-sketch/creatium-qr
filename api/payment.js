const API_KEY = "ZFH3I83C.tqQSB88JCwZwQKulPaM6JxbavGYGTm2Q";

module.exports = async (req, res) => {
  console.log('=== CREATIUM QR PAYMENT HANDLER ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);

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
      
      console.log('Raw body received:', body);

      let data = {};
      if (body) {
        data = JSON.parse(body);
      }
      
      console.log('Parsed Creatium data:', JSON.stringify(data, null, 2));

      // Извлекаем сумму из данных Creatium
      let amount = 100; // значение по умолчанию
      
      // Пробуем разные пути к сумме в данных Creatium
      if (data.payment && data.payment.amount) {
        amount = parseFloat(data.payment.amount);
      } else if (data.cart && data.cart.subtotal) {
        amount = data.cart.subtotal;
      } else if (data.amount) {
        amount = parseFloat(data.amount);
      } else if (data.sum) {
        amount = parseFloat(data.sum);
      }

      console.log('Final amount for QR:', amount);

      // 🔥 ГЕНЕРИРУЕМ QR КОД
      const payload = {
        sum: amount,
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
        const errorText = await qrResponse.text();
        console.error('QR service error:', qrResponse.status, errorText);
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      console.log('QR generated successfully:', qrResult.results ? 'Has results' : 'No results');

      // 🔥 ВАЖНО: Creatium ожидает ЧИСТЫЙ HTML, а не JSON!
      const htmlForm = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Оплата заказа</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 25px;
            font-size: 28px;
        }
        .amount {
            font-size: 42px;
            font-weight: bold;
            color: #27ae60;
            margin: 25px 0;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .qr-code-container {
            margin: 25px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 15px;
            display: inline-block;
        }
        .qr-code {
            max-width: 100%;
            height: auto;
            border: 3px solid #3498db;
            border-radius: 12px;
            background: white;
        }
        .instructions {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 12px;
            margin: 25px 0;
            text-align: left;
            font-size: 16px;
            line-height: 1.5;
        }
        .instructions strong {
            color: #1976d2;
            display: block;
            margin-bottom: 10px;
            font-size: 18px;
        }
        .security {
            background: #e8f5e8;
            color: #2e7d32;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .order-info {
            background: #fff3cd;
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            color: #856404;
        }
        .button {
            background: #3498db;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s;
        }
        .button:hover {
            background: #2980b9;
        }
        @media (max-width: 480px) {
            .container {
                padding: 25px;
                margin: 10px;
            }
            h1 {
                font-size: 24px;
            }
            .amount {
                font-size: 32px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>💳 Оплата заказа</h1>
        
        <div class="security">
            <span>🔒</span> Безопасное соединение • SSL защита
        </div>
        
        <div class="order-info">
            <strong>Сумма к оплате:</strong>
        </div>
        
        <div class="amount">${amount} ₽</div>
        
        <div class="qr-code-container">
            <img src="${qrResult.results.qr_img}" alt="QR Code для оплаты" class="qr-code">
        </div>
        
        <div class="instructions">
            <strong>📱 Как оплатить через QR-код:</strong>
            <br>1. Откройте мобильное приложение вашего банка
            <br>2. Выберите функцию "Оплата по QR-коду"
            <br>3. Наведите камеру на код выше
            <br>4. Подтвердите платёж в приложении
            <br>5. Дождитесь уведомления об успешной оплате
        </div>

        <div style="color: #666; margin-top: 25px; font-size: 14px; line-height: 1.4;">
            <strong>💡 Важно:</strong> После успешной оплаты закройте эту страницу.<br>
            Статус заказа обновится автоматически.
        </div>

        <button class="button" onclick="window.close()">Закрыть страницу</button>
    </div>

    <script>
        // Автоматическая проверка размера экрана
        function adjustQrSize() {
            const screenWidth = window.innerWidth;
            const qrContainer = document.querySelector('.qr-code-container');
            if (screenWidth < 400) {
                qrContainer.style.padding = '10px';
            }
        }

        // Проверяем при загрузке и при изменении размера окна
        window.addEventListener('load', adjustQrSize);
        window.addEventListener('resize', adjustQrSize);

        console.log('QR payment page loaded successfully');
        console.log('Amount:', ${amount});
    </script>
</body>
</html>
      `;

      // 🔥 КРИТИЧЕСКИ ВАЖНО: Возвращаем чистый HTML, а не JSON!
      console.log('Returning HTML form to Creatium');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(htmlForm);

    } catch (error) {
      console.error('Error processing payment:', error);
      
      // Возвращаем HTML с ошибкой
      const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ошибка оплаты</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: #f8d7da;
        }
        .error-container {
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            display: inline-block;
        }
        h2 { 
            color: #dc3545; 
            margin-bottom: 20px;
        }
        .retry-button {
            background: #dc3545;
            color: white;
            padding: 12px 25px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h2>❌ Ошибка при обработке оплаты</h2>
        <p style="color: #666; margin: 20px 0;">${error.message}</p>
        <p style="color: #888;">Пожалуйста, попробуйте повторить оплату позже</p>
        <button class="retry-button" onclick="window.location.reload()">Повторить попытку</button>
    </div>
</body>
</html>
      `;
      
      console.log('Returning error HTML to Creatium');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(errorHtml);
    }
  }

  // 🔥 ОБРАБОТКА GET ЗАПРОСА (для прямого доступа и тестирования)
  if (req.method === 'GET') {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum') || '100';

      console.log('Direct GET request, sum:', sum);

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
        .test-info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            color: #1976d2;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>💳 Тестовая страница оплаты</h2>
        <div class="test-info">
            Это тестовая страница. Для работы с Creatium используйте POST запросы.
        </div>
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

  // Если метод не поддерживается
  return res.status(405).json({
    error: 'Method not allowed',
    supported_methods: ['GET', 'POST', 'OPTIONS']
  });
};
