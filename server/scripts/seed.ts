/**
 * 시연·웹 개발용 가상 데이터 (개발 문서 8장 시연 데이터 원칙: 응급정보는 가상).
 * 여러 번 실행해도 같은 결과가 되도록 시드 사용자를 지우고 다시 만든다.
 *
 * 보호자 번호는 기본값이 가짜 번호다. 실제 문자 시연 때는 동의받은 팀원 번호를
 * SEED_CONTACT_PHONES=01011112222,01033334444 처럼 넘긴다.
 */
import { config } from '../src/config.js';
import { closePool, withTransaction } from '../src/db.js';
import { CONSENT_VERSION, REQUIRED_CONSENT_TYPES } from '../src/domain/constants.js';

const SEED_USER_ID = 'seed-user-jiwoo';
/** 개발용 고정 tagId. 실제 태그는 generatePublicId() 로 발급한다. */
const SEED_PUBLIC_ID = 'SeedDemoTag0000000000001';
const SEED_INACTIVE_PUBLIC_ID = 'SeedDemoTag0000000000002';

const contactPhones = (process.env.SEED_CONTACT_PHONES ?? '01000000001,01000000002')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

async function main(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM users WHERE id = $1', [SEED_USER_ID]);

    await client.query(`INSERT INTO users (id, auth_provider) VALUES ($1, 'anonymous')`, [SEED_USER_ID]);

    for (const type of REQUIRED_CONSENT_TYPES) {
      await client.query('INSERT INTO consents (user_id, type, version) VALUES ($1, $2, $3)', [
        SEED_USER_ID,
        type,
        CONSENT_VERSION,
      ]);
    }

    // 시나리오 9.1: 혈액형·알레르기만 공개
    await client.query(
      `INSERT INTO profiles
         (user_id, name, birth_date, blood_type, conditions, allergies, medications, notes, public_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        SEED_USER_ID,
        '김지우',
        '2003-05-14',
        'A형 (Rh+)',
        '천식',
        '페니실린',
        '천식 흡입기 (살부타몰)',
        '응급 시 천식 흡입기 사용이 필요합니다.',
        ['bloodType', 'allergies'],
      ],
    );

    const tag = await client.query<{ id: string }>(
      `INSERT INTO tags (public_id, user_id, label, default_message, nfc_written_at)
       VALUES ($1, $2, '키링', '긴급상황입니다. 위치 확인 부탁드립니다', now())
       RETURNING id`,
      [SEED_PUBLIC_ID, SEED_USER_ID],
    );
    const tagId = tag.rows[0]!.id;

    const contacts = [
      { name: '엄마', relation: '가족', message: '지우 응급 태그가 스캔됐어요' },
      { name: '민수', relation: '친구', message: null },
    ];
    for (const [index, contact] of contacts.entries()) {
      const phone = contactPhones[index];
      if (!phone) break;
      await client.query(
        `INSERT INTO contacts (tag_id, name, relation, phone, message, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tagId, contact.name, contact.relation, phone, contact.message, index],
      );
    }

    // 비활성 태그 안내 화면(410) 확인용
    await client.query(
      `INSERT INTO tags (public_id, user_id, label, is_active) VALUES ($1, $2, '가방 (비활성)', false)`,
      [SEED_INACTIVE_PUBLIC_ID, SEED_USER_ID],
    );
  });

  console.log('[seed] 완료');
  console.log(`  활성 태그:   ${config.publicBaseUrl}/t/${SEED_PUBLIC_ID}`);
  console.log(`  비활성 태그: ${config.publicBaseUrl}/t/${SEED_INACTIVE_PUBLIC_ID}`);
  console.log(`  보호자 번호: ${contactPhones.slice(0, 2).join(', ')}`);
}

main()
  .catch((error: unknown) => {
    console.error('[seed] 실패', error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
