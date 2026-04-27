
/**
 * Service for handling notifications (SMS, Email, Webhooks)
 */

export const notifyNewRegistration = async (userData: { email?: string; phoneNumber?: string; name: string }) => {
  console.log('[Notification Service] Novo usuário cadastrado:', userData);
  
  // INSTRUÇÕES PARA O DESENVOLVEDOR:
  // Para enviar um SMS real, você pode integrar com serviços como Twilio ou Z-API (para WhatsApp no Brasil).
  // Abaixo, um exemplo de como você poderia disparar um Webhook para um serviço de automação (Make/Zapier).
  
  const webhookUrl = process.env.VITE_REGISTRATION_WEBHOOK_URL;
  
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Novo usuário na VoxGen: ${userData.name}`,
          details: userData,
          timestamp: new Date().toISOString()
        })
      });
    } catch (e) {
      console.error('[Notification Service] Erro ao disparar webhook:', e);
    }
  }
};
