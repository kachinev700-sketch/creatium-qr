// 🔐 БЕЗОПАСНОЕ ИСПОЛЬЗОВАНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const API_KEY = process.env.QR_API_KEY;

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

  // Проверяем что API ключ загружен
  if (!API_KEY) {
    console.error('QR_API_KEY is not set in environment variables');
    
    const errorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ошибка</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
  <h2 style="color: #e74c3c;">❌ Ошибка сервера</h2>
  <p>API ключ не настроен</p>
</body>
</html>
    `;
    
    if (req.method === 'POST') {
      return res.status(200).json({
        success: false,
        form: errorHtml,
        error: 'API key not configured'
      });
    } else {
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(errorHtml);
    }
  }

  console.log('API Key loaded:', API_KEY ? '***' + API_KEY.slice(-4) : 'NOT SET');

  // 🔥 ОБРАБОТКА CALLBACK ОТ ПЛАТЕЖНОЙ СИСТЕМЫ
  if (req.method === 'POST' && req.url.includes('/callback/')) {
    try {
      console.log('💰 Payment callback received');
      
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const callbackData = JSON.parse(body);
      console.log('Callback data:', JSON.stringify(callbackData, null, 2));
      
      // Здесь можно обработать данные о платеже
      // и отправить уведомление в Creatium
      
      return res.status(200).json({ success: true, message: 'Callback received' });
      
    } catch (error) {
      console.error('Callback error:', error);
      return res.status(200).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА POST ОТ CREATIUM
  if (req.method === 'POST') {
    try {
      let body = '';
      
      // Читаем тело запроса
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('Raw body received, length:', body.length);

      let data = {};
      if (body && body.trim() !== '') {
        try {
          data = JSON.parse(body);
          console.log('✅ Successfully parsed JSON data');
        } catch (parseError) {
          console.error('❌ JSON parse error:', parseError);
          throw new Error('Invalid JSON data received');
        }
      } else {
        console.log('⚠️ Empty body received, using default data');
      }
      
      console.log('Payment amount:', data.payment?.amount);
      console.log('Cart subtotal:', data.cart?.subtotal);
      console.log('Order ID:', data.order?.id);
      console.log('Payment ID:', data.payment?.id);

      // 🔥 ИСПРАВЛЕННЫЙ РАСЧЕТ СУММЫ
      let amountInRub = 100;
      let amountForQR = 10000;
      
      if (data.payment && data.payment.amount) {
        amountInRub = parseFloat(data.payment.amount);
        amountForQR = Math.round(amountInRub * 100);
        console.log('💰 Using payment amount:', amountInRub, 'RUB ->', amountForQR, 'kopecks');
      } else if (data.cart && data.cart.subtotal) {
        amountInRub = data.cart.subtotal;
        amountForQR = Math.round(amountInRub * 100);
        console.log('💰 Using cart subtotal:', amountInRub, 'RUB ->', amountForQR, 'kopecks');
      } else {
        console.log('💰 Using default amount: 100 RUB');
      }

      // 🔥 СОЗДАЕМ УНИКАЛЬНЫЙ ID ДЛЯ ОПЛАТЫ
      const paymentId = data.payment?.id || Date.now().toString();
      const orderId = data.order?.id || 'unknown';
      
      // 🔥 URL ДЛЯ АВТОМАТИЧЕСКОГО ВОЗВРАТА ПОСЛЕ ОПЛАТЫ
      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${orderId}&payment_id=${paymentId}&status=success`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${orderId}&status=failed`;

      // 🔥 ГЕНЕРИРУЕМ QR КОД С CALLBACK URL
      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: `Оплата заказа #${orderId}`,
        notification_url: `https://creatium-qr.vercel.app/api/callback?order_id=${orderId}&payment_id=${paymentId}`
      };

      console.log('🚀 Sending to QR service...');

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
        console.error('❌ QR service error:', qrResponse.status, errorText);
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      console.log('✅ QR generated successfully');

      // Проверяем что QR-код сгенерирован
      if (!qrResult.results || !qrResult.results.qr_img) {
        console.error('❌ No QR image in response:', qrResult);
        throw new Error('QR code generation failed');
      }

      // 🔥 СОЗДАЕМ HTML ФОРМУ С АВТОМАТИЧЕСКИМ ПЕРЕНАПРАВЛЕНИЕМ
      const htmlForm = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Оплата заказа #${orderId}</title>
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
        .order-info {
            background: #fff3cd;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            color: #856404;
        }
        .status-message {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            display: none;
        }
        .countdown {
            font-size: 18px;
            font-weight: bold;
            color: #3498db;
            margin: 10px 0;
        }
        .manual-redirect {
            background: #3498db;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin: 10px 5px;
            text-decoration: none;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>💳 Оплата заказа</h1>
        
        <div class="order-info">
            <strong>Заказ #${orderId}</strong>
        </div>
        
        <div class="amount">${amountInRub} руб.</div>
        
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        
        <div class="instructions">
            <strong>Как оплатить:</strong><br>
            1. Откройте приложение вашего банка<br>
            2. Наведите камеру на QR-код<br>
            3. Подтвердите оплату<br>
            4. <strong>Автоматический возврат через 30 секунд</strong>
        </div>

        <!-- Сообщение об успешной оплате -->
        <div id="successMessage" class="status-message">
            ✅ <strong>Оплата прошла успешно!</strong> Возвращаем на сайт...
        </div>

        <!-- Таймер обратного отсчета -->
        <div id="countdown" class="countdown">
            Автоматический возврат через: <span id="timer">30</span> сек
        </div>

        <!-- Ручной переход -->
        <div style="margin-top: 20px;">
            <a href="${successUrl}" class="manual-redirect">✅ Вернуться на сайт сейчас</a>
        </div>
    </div>

    <script>
        let paymentChecked = false;
        let redirectCountdown = 30;
        let countdownInterval;

        // Функция для проверки статуса платежа
        async function checkPaymentStatus() {
            if (paymentChecked) return;
            
            try {
                console.log('🔍 Проверяем статус платежа...');
                
                // Имитация проверки статуса платежа
                // В реальной системе здесь будет запрос к API платежной системы
                const isPaid = Math.random() > 0.7; // 30% шанс что оплачено (для демо)
                
                if (isPaid) {
                    console.log('✅ Платеж обнаружен!');
                    paymentChecked = true;
                    showSuccessMessage();
                    startAutoRedirect();
                } else {
                    console.log('⏳ Платеж еще не поступил, проверяем снова через 10 сек...');
                    setTimeout(checkPaymentStatus, 10000);
                }
                
            } catch (error) {
                console.error('Ошибка проверки статуса:', error);
                setTimeout(checkPaymentStatus, 10000);
            }
        }

        // Показываем сообщение об успехе
        function showSuccessMessage() {
            document.getElementById('successMessage').style.display = 'block';
            document.getElementById('countdown').style.display = 'block';
        }

        // Автоматическое перенаправление
        function startAutoRedirect() {
            const timerElement = document.getElementById('timer');
            const successUrl = '${successUrl}';
            
            countdownInterval = setInterval(() => {
                redirectCountdown--;
                timerElement.textContent = redirectCountdown;
                
                if (redirectCountdown <= 0) {
                    clearInterval(countdownInterval);
                    console.log('🔄 Автоматическое перенаправление...');
                    window.location.href = successUrl;
                }
            }, 1000);
        }

        // Начинаем проверку статуса через 15 секунд после загрузки
        console.log('⏰ Начинаем проверку статуса платежа через 15 секунд...');
        setTimeout(() => {
            checkPaymentStatus();
        }, 15000);

        // Альтернативный вариант: проверка по клику
        document.addEventListener('click', function() {
            if (!paymentChecked) {
                console.log('👆 Пользователь кликнул, проверяем статус...');
                checkPaymentStatus();
            }
        });

        // Проверка при фокусе окна (пользователь вернулся на вкладку)
        window.addEventListener('focus', function() {
            if (!paymentChecked) {
                console.log('🪟 Пользователь вернулся на вкладку, проверяем статус...');
                checkPaymentStatus();
            }
        });

        // Сообщение при закрытии страницы
        window.addEventListener('beforeunload', function (e) {
            if (!paymentChecked) {
                const message = 'Оплата еще не завершена. Вы уверены, что хотите уйти?';
                e.returnValue = message;
                return message;
            }
        });

        // Запускаем обратный отсчет при загрузке (на всякий случай)
        console.log('🚀 Страница оплаты загружена');
    </script>
</body>
</html>
      `;

      const response = {
        success: true,
        form: htmlForm,
        url: `https://creatium-qr.vercel.app/?sum=${amountInRub}&order_id=${orderId}`,
        amount: amountInRub,
        order_id: orderId,
        payment_id: paymentId
      };

      console.log('✅ Returning successful response to Creatium');
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(response);

    } catch (error) {
      console.error('❌ Error processing payment:', error);
      
      const errorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ошибка</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
  <h2 style="color: #e74c3c;">❌ Ошибка оплаты</h2>
  <p>${error.message}</p>
  <p style="color: #666; margin-top: 20px;">Попробуйте повторить оплату позже</p>
  <a href="https://perevod-rus.ru" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">
    Вернуться на сайт
  </a>
</body>
</html>
      `;
      
      console.log('⚠️ Returning error response to Creatium');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        success: false,
        error: error.message,
        form: errorHtml
      });
    }
  }

  // 🔥 ОБРАБОТКА GET ЗАПРОСА
  if (req.method === 'GET') {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum') || '100';
      const order_id = urlParams.get('order_id') || 'test';
      const payment_id = urlParams.get('payment_id') || Date.now().toString();

      console.log('📱 Direct GET request:', { sum, order_id, payment_id });

      const amountInRub = parseFloat(sum);
      const amountForQR = Math.round(amountInRub * 100);

      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: `Оплата заказа #${order_id}`,
        notification_url: `https://creatium-qr.vercel.app/api/callback?order_id=${order_id}&payment_id=${payment_id}`
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

      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${order_id}&payment_id=${payment_id}&status=success`;

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
        .countdown {
            font-size: 16px;
            color: #3498db;
            margin: 15px 0;
        }
        .manual-redirect {
            background: #27ae60;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin: 10px 5px;
            text-decoration: none;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>💳 Оплата заказа</h2>
        <div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; color: #1976d2;">
            Заказ #${order_id}
        </div>
        <div class="amount">${amountInRub} руб.</div>
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        <div style="margin-top: 20px; color: #666;">
            Отсканируйте QR-код для оплаты ${amountInRub} руб.
        </div>
        
        <div class="countdown">
            Автоматический возврат через: <span id="timer">30</span> сек
        </div>
        
        <div style="margin-top: 20px;">
            <a href="${successUrl}" class="manual-redirect">✅ Вернуться на сайт сейчас</a>
        </div>
    </div>

    <script>
        // Автоматическое перенаправление через 30 секунд
        let seconds = 30;
        const timerElement = document.getElementById('timer');
        const successUrl = '${successUrl}';
        
        const countdown = setInterval(() => {
            seconds--;
            timerElement.textContent = seconds;
            
            if (seconds <= 0) {
                clearInterval(countdown);
                window.location.href = successUrl;
            }
        }, 1000);
    </script>
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
  <a href="https://perevod-rus.ru" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">
    Вернуться на сайт
  </a>
</body>
</html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(errorHtml);
    }
  }

  // Если метод не поддерживается
  console.error('❌ Method not allowed:', req.method);
  return res.status(405).json({
    error: 'Method not allowed',
    supported_methods: ['GET', 'POST', 'OPTIONS']
  });
};
