// 🔐 БЕЗОПАСНОЕ ИСПОЛЬЗОВАНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const API_KEY = process.env.QR_API_KEY;

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
async function checkPaymentStatus(operationId) {
  try {
    console.log(`Checking payment status for operation: ${operationId}`);
    
    const statusResponse = await fetch(`https://app.wapiserv.qrm.ooo/operations/${operationId}/qr-status/`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "X-Api-Key": API_KEY
      }
    });

    console.log(`Status API Response: ${statusResponse.status} ${statusResponse.statusText}`);
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('Payment status API response:', JSON.stringify(statusData, null, 2));
      
      // 🔥 АНАЛИЗИРУЕМ СТАТУС ОПЕРАЦИИ
      const statusCode = statusData.results?.operation_status_code;
      const statusMsg = statusData.results?.operation_status_msg;
      
      console.log(`Status Code: ${statusCode}, Message: "${statusMsg}"`);
      
      // 🔥 ВАЖНО: ТОЛЬКО КОД 5 - ОПЛАЧЕНО, ВСЕ ОСТАЛЬНОЕ - НЕ ОПЛАЧЕНО
      if (statusCode === 5) {
        console.log('PAYMENT SUCCESSFUL - Status code 5 detected!');
        return { 
          success: true, 
          status: 'paid',
          message: statusMsg,
          data: statusData 
        };
      } else {
        // 🔥 ВСЕ ДРУГИЕ КОДЫ - НЕ ОПЛАЧЕНО
        console.log(`PAYMENT NOT DONE - Status code: ${statusCode}, Message: "${statusMsg}"`);
        return { 
          success: false, 
          status: 'not_paid',
          message: statusMsg || `Status: ${statusCode}`,
          data: statusData 
        };
      }
    } else {
      const errorText = await statusResponse.text();
      console.error(`Status check failed: ${statusResponse.status}`, errorText);
      return { 
        success: false, 
        status: 'api_error',
        error: `API error: ${statusResponse.status}`,
        details: errorText
      };
    }
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    return { 
      success: false, 
      status: 'error',
      error: error.message 
    };
  }
}

module.exports = async (req, res) => {
  console.log('=== CREATIUM QR PAYMENT HANDLER ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  // Игнорируем запросы к favicon и другим статическим файлам
  if (req.url.includes('favicon') || req.url.includes('.png') || req.url.includes('.ico')) {
    return res.status(404).json({ error: 'Not found' });
  }

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
  if (req.method === 'POST' && req.url.includes('/callback')) {
    try {
      console.log('Payment callback received');
      
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('Callback raw body:', body);
      
      // Парсим callback данные
      let callbackData = {};
      if (body && body.trim() !== '') {
        try {
          callbackData = JSON.parse(body);
          console.log('Callback data parsed:', JSON.stringify(callbackData, null, 2));
        } catch (parseError) {
          console.error('Callback JSON parse error:', parseError);
          console.log('Raw callback body:', body);
        }
      }
      
      // 🔥 ОБРАБАТЫВАЕМ CALLBACK
      const operationId = callbackData.operation_id || callbackData.id;
      const status = callbackData.status || callbackData.payment_status;
      
      console.log(`Callback processed - Operation: ${operationId}, Status: ${status}`);
      
      if (status === 'success' || status === 'paid' || status === 'completed') {
        console.log('Payment successful via callback!');
      }
      
      return res.status(200).json({ success: true, message: 'Callback received' });
      
    } catch (error) {
      console.error('Callback error:', error);
      return res.status(200).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
  if (req.method === 'POST' && req.url.includes('/check-status')) {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { operationId } = JSON.parse(body);
      console.log(`Status check requested for operation: ${operationId}`);
      
      if (!operationId) {
        return res.status(400).json({ success: false, error: 'Operation ID required' });
      }
      
      const statusResult = await checkPaymentStatus(operationId);
      return res.status(200).json(statusResult);
      
    } catch (error) {
      console.error('Status check error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА POST ОТ CREATIUM (ОСНОВНОЙ ENDPOINT)
  if (req.method === 'POST' && !req.url.includes('/callback') && !req.url.includes('/check-status')) {
    try {
      let body = '';
      
      // Читаем тело запроса
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('Raw body received from Creatium, length:', body.length);

      let data = {};
      if (body && body.trim() !== '') {
        try {
          data = JSON.parse(body);
          console.log('Successfully parsed Creatium JSON data');
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          throw new Error('Invalid JSON data received from Creatium');
        }
      } else {
        console.log('Empty body received from Creatium, using default data');
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
        console.log('Using payment amount:', amountInRub, 'RUB ->', amountForQR, 'kopecks');
      } else if (data.cart && data.cart.subtotal) {
        amountInRub = data.cart.subtotal;
        amountForQR = Math.round(amountInRub * 100);
        console.log('Using cart subtotal:', amountInRub, 'RUB ->', amountForQR, 'kopecks');
      } else {
        console.log('Using default amount: 100 RUB');
      }

      // 🔥 СОЗДАЕМ УНИКАЛЬНЫЙ ID ДЛЯ ОПЛАТЫ
      const paymentId = data.payment?.id || `creatium_${Date.now()}`;
      const orderId = data.order?.id || 'unknown';
      
      // 🔥 URL ДЛЯ ВОЗВРАТА
      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${orderId}&payment_id=${paymentId}&status=success&paid=true`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${orderId}&status=failed&paid=false`;

      // 🔥 ГЕНЕРИРУЕМ QR КОД С ФИКСИРОВАННЫМ НАЗНАЧЕНИЕМ ПЛАТЕЖА
      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода с иностранных языков",
        notification_url: `https://creatium-qr.vercel.app/api/callback?order_id=${orderId}&payment_id=${paymentId}`
      };

      console.log('Sending to QR service...');
      console.log('QR payload:', JSON.stringify(payload, null, 2));

      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      console.log(`QR API Response: ${qrResponse.status} ${qrResponse.statusText}`);

      if (!qrResponse.ok) {
        const errorText = await qrResponse.text();
        console.error('QR service error:', qrResponse.status, errorText);
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      console.log('QR generated successfully');
      console.log('QR response structure:', JSON.stringify(qrResult, null, 2));

      // 🔥 ПОЛУЧАЕМ OPERATION_ID ИЗ ОТВЕТА
      let operationId = null;
      
      if (qrResult.results && qrResult.results.operation_id) {
        operationId = qrResult.results.operation_id;
        console.log('Found operation_id in results.operation_id:', operationId);
      } else {
        operationId = paymentId;
        console.log('No operation_id found, using paymentId:', operationId);
      }

      console.log('Final Operation ID for status checking:', operationId);

      // Проверяем что QR-код сгенерирован
      if (!qrResult.results || !qrResult.results.qr_img) {
        console.error('No QR image in response:', qrResult);
        throw new Error('QR code generation failed');
      }

      // 🔥 СОЗДАЕМ HTML ФОРМУ
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
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .status-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status-pending {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .checking-status {
            background: #e3f2fd;
            color: #1976d2;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
        }
        .button {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin: 10px 5px;
            text-decoration: none;
            display: inline-block;
        }
        .button-success {
            background: #27ae60;
            color: white;
        }
        .button-check {
            background: #3498db;
            color: white;
        }
        .button-cancel {
            background: #e74c3c;
            color: white;
        }
        .debug-info {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-size: 12px;
            color: #6c757d;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>💳 Оплата заказа</h1>
        
        <div class="order-info">
            <strong>Заказ #${orderId}</strong><br>
            <small>ID операции: ${operationId}</small>
        </div>
        
        <div class="amount">${amountInRub} руб.</div>
        
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        
        <div class="instructions">
            <strong>Автоматическая проверка статуса оплаты</strong><br>
            • Отсканируйте QR-код и оплатите<br>
            • Система проверит статус автоматически<br>
            • <strong>Авто-возврат ТОЛЬКО при статусе "5"</strong>
        </div>

        <!-- Статус проверки -->
        <div id="checkingStatus" class="checking-status">
            🔍 Первая проверка через 10 секунд...
        </div>

        <!-- Сообщения о статусе -->
        <div id="successMessage" class="status-message status-success" style="display: none;">
            ✅ <strong>ОПЛАЧЕНО! Статус: 5</strong><br>
            <div id="countdown" class="checking-status" style="margin: 10px 0;">
                Авто-возврат через: <span id="timer">5</span> сек
            </div>
        </div>

        <div id="pendingMessage" class="status-message status-pending" style="display: none;">
            ⏳ <strong>ОЖИДАНИЕ ОПЛАТЫ</strong><br>
            <small>Текущий статус: <span id="statusInfo">проверяем...</span></small>
        </div>

        <!-- Отладочная информация -->
        <div class="debug-info">
            <strong>Информация для отладки:</strong><br>
            • Operation ID: <code>${operationId}</code><br>
            • Order ID: ${orderId}<br>
            • Сумма: ${amountInRub} руб.<br>
            • <strong>Требуется статус: 5 (Оплачено)</strong>
        </div>

        <!-- Кнопки управления -->
        <div style="margin-top: 20px;">
            <button id="checkStatusBtn" class="button button-check">🔄 Проверить статус</button>
            <a href="${successUrl}" id="manualSuccessBtn" class="button button-success">✅ Я оплатил (вручную)</a>
            <a href="${failUrl}" class="button button-cancel">❌ Отмена</a>
        </div>
    </div>

    <script>
        const operationId = '${operationId}';
        const successUrl = '${successUrl}';
        
        let checkInterval;
        let paidStatus = false;

        // Функция проверки статуса платежа
        async function checkPaymentStatus() {
            try {
                const response = await fetch('/api/check-status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        operationId: operationId
                    })
                });
                
                const result = await response.json();
                console.log('Status check result:', result);
                
                if (result.success && result.status === 'paid') {
                    // 🔥 ПЛАТЕЖ УСПЕШЕН
                    paidStatus = true;
                    showSuccess();
                } else {
                    // 🔥 НЕ ОПЛАЧЕНО
                    const statusCode = result.data?.results?.operation_status_code;
                    const statusMsg = result.data?.results?.operation_status_msg;
                    showPending(statusCode, statusMsg);
                }
                
            } catch (error) {
                console.error('Status check failed:', error);
                showPending('error', 'Ошибка проверки');
            }
        }

        // Показать успешный статус
        function showSuccess() {
            document.getElementById('successMessage').style.display = 'block';
            document.getElementById('pendingMessage').style.display = 'none';
            document.getElementById('checkStatusBtn').style.display = 'none';
            document.getElementById('manualSuccessBtn').style.display = 'none';
            
            // Остановить проверку
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            
            // Запустить авто-редирект
            startAutoRedirect();
        }

        // Показать ожидание
        function showPending(statusCode, statusMsg) {
            document.getElementById('successMessage').style.display = 'none';
            document.getElementById('pendingMessage').style.display = 'block';
            document.getElementById('statusInfo').textContent = 'код ' + statusCode + ' - ' + (statusMsg || 'не оплачено');
        }

        // Автоматическое перенаправление
        function startAutoRedirect() {
            let seconds = 5;
            const countdownInterval = setInterval(() => {
                seconds--;
                document.getElementById('timer').textContent = seconds;
                
                if (seconds <= 0) {
                    clearInterval(countdownInterval);
                    window.location.href = successUrl;
                }
            }, 1000);
        }

        // Начать автоматическую проверку
        function startAutoCheck() {
            // Первая проверка через 10 секунд
            setTimeout(() => {
                checkPaymentStatus();
                // Дальнейшие проверки каждые 15 секунд
                checkInterval = setInterval(checkPaymentStatus, 15000);
            }, 10000);
        }

        // Ручная проверка по кнопке
        document.getElementById('checkStatusBtn').addEventListener('click', checkPaymentStatus);

        // Запуск при загрузке
        console.log('Starting payment monitoring for operation:', operationId);
        startAutoCheck();

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
        payment_id: paymentId,
        operation_id: operationId
      };

      console.log('Returning successful response to Creatium');
      
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
  <a href="https://perevod-rus.ru" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">
    Вернуться на сайт
  </a>
</body>
</html>
      `;
      
      console.log('Returning error response to Creatium');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        success: false,
        error: error.message,
        form: errorHtml
      });
    }
  }

  // 🔥 ОБРАБОТКА GET ЗАПРОСА (для прямого доступа)
  if (req.method === 'GET' && !req.url.includes('favicon') && !req.url.includes('.png')) {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum') || '100';
      const order_id = urlParams.get('order_id') || 'test';

      console.log('Direct GET request:', { sum, order_id });

      const amountInRub = parseFloat(sum);
      const amountForQR = Math.round(amountInRub * 100);

      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода с иностранных языков",
        notification_url: 'https://creatium-qr.vercel.app/api/callback'
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
      
      // Получаем operation_id из ответа
      let operationId = qrResult.results?.operation_id || `test_${Date.now()}`;

      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${order_id}&operation_id=${operationId}&status=success&paid=true`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${order_id}&status=failed&paid=false`;

      const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Тест оплаты ${amountInRub} руб.</title>
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
        <h2>💳 Тест оплаты</h2>
        <div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; color: #1976d2;">
            Заказ #${order_id}<br>
            <small>Operation ID: ${operationId}</small>
        </div>
        <div class="amount">${amountInRub} руб.</div>
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        <div style="margin-top: 20px;">
            <a href="${successUrl}" style="background: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 5px;">
                ✅ Тест успеха
            </a>
            <a href="${failUrl}" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 5px;">
                ❌ Тест отмены
            </a>
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

  // Если метод не поддерживается или путь не найден
  return res.status(404).json({
    error: 'Not found',
    message: 'Endpoint not found'
  });
};
