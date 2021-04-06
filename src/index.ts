import * as Sentry from '@sentry/node';

import { InternalKickboard, KickboardPermission } from 'openapi-internal-sdk';

import InternalClient from './tools/internalClient';
import _ from 'lodash';
import { firestore } from './tools/firestore';
import logger from './tools/logger';

const sleep = (timeout: number) =>
  new Promise((resolve) => setTimeout(resolve, timeout));

const getStatus = (diff: number) =>
  diff <= 100 ? '정상' : diff <= 200 ? '점검 필요' : '교체 필요';

const kickboardCol = firestore.collection('kick');
const kickboardClient = InternalClient.getKickboard([
  KickboardPermission.LOOKUP_BATTERY,
  KickboardPermission.METHOD_REFRESH,
  KickboardPermission.METHOD_LATEST,
  KickboardPermission.LOOKUP_DETAIL,
  KickboardPermission.SEARCH_LIST,
]);

async function main() {
  try {
    logger.info('[Main] 시스템이 활성화되고 있습니다.');
    initSentry();

    let skip = 0;
    while (true) {
      const { total, kickboards } = await getKickboards();
      for (const kickboard of kickboards) {
        skip++;

        await updateKickboardHealth(kickboard);
      }

      if (skip >= total) break;
      sleep(1);
    }

    logger.info('[Main] 시스템 점검이 완료되었습니다.');
  } catch (err) {
    Sentry.captureException(err);
    logger.error('[Service] 시스템을 활성화할 수 없습니다.');
    logger.error(`[Service] ${err.stack}`);
    process.exit(1);
  }
}

async function updateKickboardHealth(kickboard: InternalKickboard) {
  const { kickboardCode, kickboardId } = kickboard;
  try {
    const updatedAt = new Date();
    const kickboardDoc = kickboardCol.doc(kickboardId);
    const battery = await getBatteryCheck(kickboard);
    await kickboardDoc.update({ health: { battery, updatedAt } });
    logger.info(`[${kickboardCode}] 검사 완료했습니다. (${battery.status})`);
  } catch (err) {
    Sentry.captureException(err);
    logger.warn(
      `[${kickboardCode}] 킥보드의 배터리 상태를 확인할 수 없습니다.`
    );
  }
  sleep(1);
}

async function getBatteryCheck(
  kickboard: InternalKickboard
): Promise<{ cells: number[]; diff: number; status: string }> {
  const { cells, diff } = await getBatteryInfo(kickboard);
  const status = getStatus(diff);

  return { cells, diff, status };
}

async function getBatteryInfo(
  kickboard: InternalKickboard
): Promise<{ cells: number[]; diff: number }> {
  const battery = await kickboard.refreshBattery();
  const { cells } = battery;
  const min = _.min(cells) || 0;
  const max = _.max(cells) || 0;
  const diff = max - min;

  return { cells, diff };
}

async function getKickboards(
  skip = 0
): Promise<{ total: number; kickboards: InternalKickboard[] }> {
  const take = 100;
  const kickboards = await kickboardClient.getKickboards({
    take,
    skip,
    search: 'DE20KP',
  });

  return kickboards;
}

async function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  });

  logger.info('[Sentry] 보고 시스템이 활성화되었습니다.');
}

main();
