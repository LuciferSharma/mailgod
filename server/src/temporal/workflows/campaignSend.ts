import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type * as activities from '../activities/email';

const { sendCampaignEmail, updateCampaignStats } = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 seconds',
  retry: { maximumAttempts: 3 },
});

export const pauseSignal = defineSignal('pause');
export const resumeSignal = defineSignal('resume');
export const cancelSignal = defineSignal('cancel');

interface CampaignSendInput {
  campaignId: string;
  templateId: string;
  subscriberIds: string[];
  batchSize: number;
  emailsPerHour: number;
}

export async function sendCampaign(input: CampaignSendInput): Promise<{ sent: number; failed: number }> {
  const { campaignId, templateId, subscriberIds, batchSize, emailsPerHour } = input;

  let paused = false;
  let cancelled = false;

  setHandler(pauseSignal, () => { paused = true; });
  setHandler(resumeSignal, () => { paused = false; });
  setHandler(cancelSignal, () => { cancelled = true; });

  let sent = 0;
  let failed = 0;
  const delayBetweenBatches = Math.ceil((batchSize / emailsPerHour) * 3600_000);

  for (let i = 0; i < subscriberIds.length; i += batchSize) {
    if (cancelled) break;
    if (paused) {
      await condition(() => !paused || cancelled);
      if (cancelled) break;
    }

    const batch = subscriberIds.slice(i, i + batchSize);

    let batchSent = 0;
    for (const subscriberId of batch) {
      if (cancelled) break;

      try {
        const result = await sendCampaignEmail({
          subscriberId,
          templateId,
          campaignId,
        });

        if (result.success) { sent++; batchSent++; }
        else failed++;
      } catch {
        failed++;
      }
    }

    if (batchSent > 0) {
      await updateCampaignStats({ campaignId, sent: batchSent });
    }

    if (i + batchSize < subscriberIds.length && !cancelled) {
      await sleep(delayBetweenBatches);
    }
  }

  return { sent, failed };
}
