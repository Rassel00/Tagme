/**
 * 국립중앙의료원 AED 정보 조회 서비스 → aeds 테이블 (WBS 2.20).
 * 위치 반경 검색이 없는 API 라 하루 1회 전국 목록(약 6.4만 건)을 받아 두고 거리순 조회는 DB 에서 한다.
 * 한 번에 5,000건씩 약 13번 호출 (docs/개발-진행.md AED API 확인 참고).
 */
import { config } from '../config.js';
import { getPool } from '../db.js';

const ENDPOINT = 'https://apis.data.go.kr/B552657/AEDInfoInqireService/getEgytAedManageInfoInqire';
const PAGE_SIZE = 5000;
const STALE_HOURS = 24;

export interface AedItem {
  id: string;
  name: string;
  place: string;
  address: string;
  lat: number;
  lng: number;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(xml: string, name: string): string {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match?.[1] ? decodeXml(match[1]) : '';
}

/** 응답 XML 에서 item 목록과 전체 건수를 꺼낸다. 좌표가 없거나 이상한 항목은 버린다. */
export function parseAedXml(xml: string): { items: AedItem[]; totalCount: number } {
  const resultCode = tag(xml, 'resultCode');
  if (resultCode && resultCode !== '00') throw new Error(`AED API 오류 ${resultCode}: ${tag(xml, 'resultMsg')}`);
  const items: AedItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = match[1]!;
    const lat = Number(tag(item, 'wgs84Lat'));
    const lng = Number(tag(item, 'wgs84Lon'));
    const id = tag(item, 'serialSeq');
    // 국내 좌표 범위 밖이면 잘못 입력된 데이터
    if (!id || !(lat > 33 && lat < 39) || !(lng > 124 && lng < 132)) continue;
    items.push({
      id,
      name: tag(item, 'org') || '설치기관 미상',
      place: tag(item, 'buildPlace'),
      address: tag(item, 'buildAddress'),
      lat,
      lng,
    });
  }
  return { items, totalCount: Number(tag(xml, 'totalCount')) || 0 };
}

async function fetchPage(pageNo: number): Promise<{ items: AedItem[]; totalCount: number }> {
  const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(config.aedApiKey ?? '')}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`AED API HTTP ${response.status}`);
  return parseAedXml(await response.text());
}

async function upsert(items: AedItem[]): Promise<void> {
  // 같은 페이지 안의 중복 ID 는 마지막 값만 (ON CONFLICT 가 한 행을 두 번 고칠 수 없음)
  const unique = [...new Map(items.map((i) => [i.id, i])).values()];
  await getPool().query(
    `INSERT INTO aeds (id, name, place, address, lat, lng, updated_at)
     SELECT * , now() FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[])
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, place = EXCLUDED.place, address = EXCLUDED.address,
       lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = now()`,
    [
      unique.map((i) => i.id),
      unique.map((i) => i.name),
      unique.map((i) => i.place),
      unique.map((i) => i.address),
      unique.map((i) => i.lat),
      unique.map((i) => i.lng),
    ],
  );
}

/** 전국 AED 를 받아 저장. 이번에 받지 못한(철거된) 항목은 지운다. @return 저장한 건수 */
export async function syncAeds(log: (message: string) => void = console.log): Promise<number> {
  if (!config.aedApiKey) throw new Error('AED_API_KEY 가 설정되지 않았습니다.');
  const startedAt = new Date();
  const first = await fetchPage(1);
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  await upsert(first.items);
  let saved = first.items.length;
  for (let page = 2; page <= pages; page += 1) {
    const { items } = await fetchPage(page);
    await upsert(items);
    saved += items.length;
    log(`[aed] ${page}/${pages} 페이지 (${saved}건)`);
  }
  // 전체를 정상적으로 받았을 때만 오래된 항목 정리
  if (saved > first.totalCount * 0.9) {
    await getPool().query('DELETE FROM aeds WHERE updated_at < $1', [startedAt]);
  }
  log(`[aed] 동기화 완료: ${saved}건 (전체 ${first.totalCount}건)`);
  return saved;
}

/** 서버 시작 시 데이터가 하루 넘게 오래됐으면 백그라운드로 동기화하고, 이후 하루마다 반복 */
export function scheduleAedSync(): void {
  if (!config.aedApiKey) return;
  const runIfStale = async () => {
    try {
      const { rows } = await getPool().query<{ latest: Date | null }>('SELECT max(updated_at) AS latest FROM aeds');
      const latest = rows[0]?.latest;
      if (latest && Date.now() - latest.getTime() < STALE_HOURS * 3_600_000) return;
      await syncAeds();
    } catch (error) {
      console.error('[aed] 동기화 실패', error);
    }
  };
  void runIfStale();
  setInterval(() => void runIfStale(), 6 * 3_600_000).unref();
}
