// 🔐 БЕЗОПАСНОЕ ИСПОЛЬЗОВАНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const API_KEY = process.env.QR_API_KEY;

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
async function checkPaymentStatus(operationId) {
  try {
    console.log(`🔍 Checking payment status for operation: ${operationId}`);
    
    const statusResponse = await fetch(`https://app.wapiserv.qrm.ooo/operations/${operationId}/qr-status/`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "X-Api-Key": API_KEY
      }
    });

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('✅ Payment status API response:', JSON.stringify(statusData, null, 2));
      
      // 🔥 АНАЛИЗИРУЕМ СТАТУС ОПЕРАЦИИ
      const statusCode = statusData.results?.operation_status_code;
      const statusMsg = statusData.results?.operation_status_msg;
      
      console.log(`📊 Status Code: ${statusCode}, Message: "${statusMsg}"`);
      
      // 🔥 ВАЖНО: ТОЛЬКО КОД 5 - ОПЛАЧЕНО, ВСЕ ОСТАЛЬНОЕ - НЕ ОПЛАЧЕНО
      if (statusCode === 5) {
        return { 
          success: true, 
          status: 'paid',
          message: statusMsg,
          data: statusData 
        };
      } else {
        // 🔥 ВСЕ ДРУГИЕ КОДЫ - НЕ ОПЛАЧЕНО
        return { 
          success: false, 
          status: 'not_paid',
          message: statusMsg || `Статус: ${statusCode}`,
          data: statusData 
        };
      }
    } else {
      const errorText = await statusResponse.text();
      console.error(`❌ Status check failed: ${statusResponse.status}`, errorText);
      return { 
        success: false, 
        status: 'api_error',
        error: `API error: ${statusResponse.status}` 
      };
    }
    
  } catch (error) {
    console.error('❌ Error checking payment status:', error);
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

  // 🔥 ОБРАБОТКА ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
  if (req.method === 'POST' && req.url.includes('/check-status/')) {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { operationId } = JSON.parse(body);
      console.log(`🔍 Status check requested for operation: ${operationId}`);
      
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
      const paymentId = data.payment?.id || `creatium_${Date.now()}`;
      const orderId = data.order?.id || 'unknown';
      
      // 🔥 URL ДЛЯ ВОЗВРАТА
      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${orderId}&payment_id=${paymentId}&status=success&paid=true`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${orderId}&status=failed&paid=false`;

      // 🔥 ГЕНЕРИРУЕМ QR КОД
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
      console.log('QR response:', JSON.stringify(qrResult, null, 2));

      // 🔥 ПОЛУЧАЕМ OPERATION_ID ИЗ ОТВЕТА
      let operationId = null;
      
      if (qrResult.results && qrResult.results.operation_id) {
        operationId = qrResult.results.operation_id;
      } else if (qrResult.operation_id) {
        operationId = qrResult.operation_id;
      } else if (qrResult.id) {
        operationId = qrResult.id;
      } else {
        // Если нет operation_id, создаем свой на основе paymentId
        operationId = paymentId;
        console.log('⚠️ No operation_id in response, using paymentId:', operationId);
      }

      console.log('🎯 Operation ID for status checking:', operationId);

      // Проверяем что QR-код сгенерирован
      if (!qrResult.results || !qrResult.results.qr_img) {
        console.error('❌ No QR image in response:', qrResult);
        throw new Error('QR code generation failed');
      }

      // 🔥 СОЗДАЕМ HTML ФОРМУ БЕЗ АВТО-РЕДИРЕКТА
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
        .status-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
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
        .warning {
            background: #fff3cd;
            color: #856404;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            border: 1px solid #ffeaa7;
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
            • <strong>Авто-возврат ТОЛЬКО при успешной оплате</strong>
        </div>

        <div class="warning">
            ⚠️ <strong>Внимание:</strong> Авто-возврат произойдет только после реального платежа!
        </div>

        <!-- Отладочная информация -->
        <div class="debug-info">
            <strong>Отладка:</strong><br>
            Operation ID: ${operationId}<br>
            Order ID: ${orderId}<br>
            Сумма: ${amountInRub} руб.<br>
            <strong>Только статус 5 = "Оплачено"</strong>
        </div>

        <!-- Статус проверки -->
        <div id="checkingStatus" class="checking-status">
            🔍 Начинаем проверку статуса через 10 секунд...
        </div>

        <!-- Сообщения о статусе -->
        <div id="successMessage" class="status-message status-success" style="display: none;">
            ✅ <strong>Оплата прошла успешно!</strong><br>
            <div id="countdown" class="checking-status" style="margin: 10px 0;">
                Авто-возврат через: <span id="timer">10</span> сек
            </div>
            <small>Статус: <span id="statusDetail">Оплачено</span></small>
        </div>

        <div id="pendingMessage" class="status-message status-pending" style="display: none;">
            ⏳ <strong>Ожидание оплаты...</strong><br>
            <small>Статус: <span id="pendingDetail">Не оплачено</span></small>
        </div>

        <div id="errorMessage" class="status-message status-error" style="display: none;">
            ❌ <strong>Ошибка проверки</strong><br>
            <small id="errorDetail">Не удалось проверить статус</small>
        </div>

        <!-- Кнопки управления -->
        <div style="margin-top: 20px;">
            <button id="checkStatusBtn" class="button button-check">🔄 Проверить статус сейчас</button>
            <a href="${successUrl}" id="manualSuccessBtn" class="button button-success">✅ Я оплатил (вручную)</a>
            <a href="${failUrl}" class="button button-cancel">❌ Отмена оплаты</a>
        </div>

        <div style="color: #666; margin-top: 20px; font-size: 14px; line-height: 1.4;">
            <strong>Как работает:</strong><br>
            • Проверка каждые 15 секунд<br>
            • Авто-возврат ТОЛЬКО при статусе "5"<br>
            • Все остальные статусы = не оплачено
        </div>
    </div>

    <script>
        const operationId = '${operationId}';
        const orderId = '${orderId}';
        const successUrl = '${successUrl}';
        
        let checkInterval;
        let isChecking = false;
        let paidStatus = false;

        // Элементы DOM
        const checkingStatus = document.getElementById('checkingStatus');
        const successMessage = document.getElementById('successMessage');
        const pendingMessage = document.getElementById('pendingMessage');
        const errorMessage = document.getElementById('errorMessage');
        const countdown = document.getElementById('countdown');
        const timer = document.getElementById('timer');
        const statusDetail = document.getElementById('statusDetail');
        const pendingDetail = document.getElementById('pendingDetail');
        const errorDetail = document.getElementById('errorDetail');
        const checkStatusBtn = document.getElementById('checkStatusBtn');
        const manualSuccessBtn = document.getElementById('manualSuccessBtn');

        // Функция проверки статуса платежа
        async function checkPaymentStatus() {
            if (isChecking || paidStatus) return;
            
            isChecking = true;
            try {
                checkingStatus.style.display = 'block';
                checkingStatus.textContent = '🔍 Проверяем статус платежа...';
                
                const response = await fetch('/api/check-status/', {
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
                
                checkingStatus.style.display = 'none';
                
                if (result.success && result.status === 'paid') {
                    // 🔥 ПЛАТЕЖ УСПЕШЕН - ТОЛЬКО КОГДА СТАТУС 5
                    paidStatus = true;
                    showSuccess(result.message, result.data);
                } else {
                    // 🔥 НЕ ОПЛАЧЕНО - ЛЮБОЙ ДРУГОЙ СТАТУС
                    showPending(result.message, result.data);
                }
                
            } catch (error) {
                console.error('Status check failed:', error);
                checkingStatus.style.display = 'none';
                showError('Ошибка проверки статуса: ' + error.message);
            } finally {
                isChecking = false;
            }
        }

        // Показать успешный статус
        function showSuccess(message, data) {
            successMessage.style.display = 'block';
            pendingMessage.style.display = 'none';
            errorMessage.style.display = 'none';
            checkStatusBtn.style.display = 'none';
            manualSuccessBtn.style.display = 'none';
            
            const statusCode = data?.results?.operation_status_code;
            const statusMsg = data?.results?.operation_status_msg;
            
            statusDetail.textContent = statusMsg || message || 'Оплачено';
            
            // Остановить проверку
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            
            // Запустить авто-редирект
            startAutoRedirect();
        }

        // Показать ожидание (не оплачено)
        function showPending(message, data) {
            successMessage.style.display = 'none';
            pendingMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            
            const statusCode = data?.results?.operation_status_code;
            const statusMsg = data?.results?.operation_status_msg;
            
            pendingDetail.textContent = statusMsg || message || 'Не оплачено';
            console.log('📊 Current status:', statusCode, '-', statusMsg);
        }

        // Показать ошибку
        function showError(message) {
            successMessage.style.display = 'none';
            pendingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorDetail.textContent = message;
        }

        // Автоматическое перенаправление
        function startAutoRedirect() {
            let seconds = 10;
            const countdownInterval = setInterval(() => {
                seconds--;
                timer.textContent = seconds;
                
                if (seconds <= 0) {
                    clearInterval(countdownInterval);
                    console.log('🔄 Auto-redirect to success page');
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
        checkStatusBtn.addEventListener('click', checkPaymentStatus);

        // Подтверждение для ручного перехода
        manualSuccessBtn.addEventListener('click', function(e) {
            if (!paidStatus) {
                const confirmed = confirm('ВЫ УВЕРЕНЫ, ЧТО ОПЛАТИЛИ ЗАКАЗ?\n\nНажимайте OK только если:\n• Деньги списаны с вашего счета\n• Вы получили подтверждение оплаты\n\nНеправильное подтверждение приведет к ошибке статуса заказа!');
                if (!confirmed) {
                    e.preventDefault();
                }
            }
        });

        // Запуск при загрузке
        console.log('🚀 Starting payment monitoring for operation:', operationId);
        console.log('🔒 Auto-redirect will happen ONLY for status code 5');
        startAutoCheck();

        // Предупреждение при закрытии
        window.addEventListener('beforeunload', function (e) {
            if (!paidStatus) {
                e.returnValue = 'Оплата не завершена. Вы уверены, что хотите уйти?';
                return e.returnValue;
            }
        });
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

  // 🔥 ОБРАБОТКА GET ЗАПРОСА (для прямого доступа)
  if (req.method === 'GET') {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum') || '100';
      const order_id = urlParams.get('order_id') || 'test';

      console.log('📱 Direct GET request:', { sum, order_id });

      const amountInRub = parseFloat(sum);
      const amountForQR = Math.round(amountInRub * 100);

      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: `Тест оплаты #${order_id}`,
        notification_url: `https://creatium-qr.vercel.app/api/callback`
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
      let operationId = qrResult.results?.operation_id || qrResult.operation_id || qrResult.id || `test_${Date.now()}`;

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
        <h2>💳 Тест оплаты</h2>
        <div style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; color: #1976d2;">
            Заказ #${order_id}
        </div>
        <div class="amount">${amountInRub} руб.</div>
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        
        <div class="debug-info">
            <strong>Тестовая информация:</strong><br>
            Operation ID: ${operationId}<br>
            Для проверки статуса используйте этот ID<br>
            <strong>Только статус 5 = оплачено!</strong>
        </div>
        
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

  // Если метод не поддерживается
  console.error('❌ Method not allowed:', req.method);
  return res.status(405).json({
    error: 'Method not allowed',
    supported_methods: ['GET', 'POST', 'OPTIONS']
  });
};
