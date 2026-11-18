/** 보호 대상자 (응급정보의 주인) CRUD. 태그는 대상자에 연결된다. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../db.js';
import { MAX_INSURANCES_PER_PERSON, PERSON_TYPES, PUBLIC_FIELDS } from '../domain/constants.js';
import { currentUser } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { parseOrThrow } from '../lib/validate.js';
import { findOwnedPerson, loadInsurances, PERSON_COLUMNS, personJson, toPerson } from '../repos/persons.js';

const MAX_PERSONS_PER_USER = 10;

const shortText = (max: number) => z.string().trim().max(max);

export const personBody = z.object({
  name: shortText(30).min(1, '이름을 입력하세요.'),
  birthDate: z
    .union([z.literal(''), z.iso.date()])
    .default('')
    .refine((v) => !v || v <= new Date().toISOString().slice(0, 10), '미래 날짜는 입력할 수 없습니다.'),
  bloodType: shortText(20).default(''),
  conditions: shortText(200).default(''),
  allergies: shortText(200).default(''),
  medications: shortText(200).default(''),
  notes: shortText(500).default(''),
  personType: z.enum(PERSON_TYPES).default('general'),
  disabilityType: shortText(50).default(''),
  communication: shortText(100).default(''),
  careTips: shortText(200).default(''),
  /** 보험 (선택, 최대 3개). 공개 여부는 publicFields 의 'insurances' 하나로 */
  insurances: z
    .array(
      z.object({
        // 보험사·상품 이름 (예: OO손해보험 자동차). 종류는 따로 받지 않는다
        company: shortText(30).min(1, '보험사를 입력하세요.'),
        // 보험사 사고 접수 번호 (대표번호 1588-xxxx 등). 숫자·하이픈만
        phone: shortText(20).regex(/^[0-9-]*$/, '보험사 번호는 숫자와 하이픈(-)만 입력하세요.').default(''),
        note: shortText(100).default(''),
      }),
    )
    .max(MAX_INSURANCES_PER_PERSON, `보험은 최대 ${MAX_INSURANCES_PER_PERSON}개까지 등록할 수 있습니다.`)
    .default([]),
  publicFields: z
    .array(z.enum(PUBLIC_FIELDS))
    .max(PUBLIC_FIELDS.length)
    .default([])
    .transform((fields) => [...new Set(fields)]),
});

export function personParams(p: z.infer<typeof personBody>) {
  return [
    p.name,
    p.birthDate || null,
    p.bloodType,
    p.conditions,
    p.allergies,
    p.medications,
    p.notes,
    p.publicFields,
    p.personType,
    p.disabilityType,
    p.communication,
    p.careTips,
  ];
}

/** 보험 목록을 통째로 바꾼다 */
async function saveInsurances(
  client: import('pg').PoolClient,
  personId: string,
  insurances: z.infer<typeof personBody>['insurances'],
): Promise<void> {
  await client.query('DELETE FROM person_insurances WHERE person_id = $1', [personId]);
  for (const [index, insurance] of insurances.entries()) {
    await client.query(
      'INSERT INTO person_insurances (person_id, company, phone, note, sort_order) VALUES ($1, $2, $3, $4, $5)',
      [personId, insurance.company, insurance.phone, insurance.note, index],
    );
  }
}

export async function requireOwnedPerson(personId: string, userId: string) {
  if (!z.uuid().safeParse(personId).success) throw ApiError.notFound('person_not_found', '대상자를 찾을 수 없습니다.');
  const person = await findOwnedPerson(getPool(), personId, userId);
  if (!person) throw ApiError.notFound('person_not_found', '대상자를 찾을 수 없습니다.');
  return person;
}

export function createPersonsRouter(): Router {
  const router = Router();

  // 대상자 목록 + 연결된 태그 수
  router.get('/', async (_req, res) => {
    const { rows } = await getPool().query(
      `SELECT ${PERSON_COLUMNS}, (SELECT count(*)::int FROM tags t WHERE t.person_id = p.id) AS tag_count
       FROM persons p WHERE p.user_id = $1 ORDER BY p.created_at`,
      [currentUser(res.locals).uid],
    );
    const insurances = await loadInsurances(getPool(), rows.map((row) => row.id as string));
    res.json(
      rows.map((row) => ({
        ...personJson({ ...toPerson(row), insurances: insurances.get(row.id) ?? [] }),
        tagCount: row.tag_count as number,
      })),
    );
  });

  router.post('/', async (req, res) => {
    const user = currentUser(res.locals);
    const body = parseOrThrow(personBody, req.body);
    const { rows: count } = await getPool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM persons WHERE user_id = $1',
      [user.uid],
    );
    if ((count[0]?.n ?? 0) >= MAX_PERSONS_PER_USER) {
      throw new ApiError(409, 'person_limit', `대상자는 최대 ${MAX_PERSONS_PER_USER}명까지 등록할 수 있습니다.`);
    }
    const personId = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO persons (user_id, name, birth_date, blood_type, conditions, allergies, medications, notes,
                              public_fields, person_type, disability_type, communication, care_tips)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [user.uid, ...personParams(body)],
      );
      await saveInsurances(client, rows[0]!.id, body.insurances);
      return rows[0]!.id;
    });
    res.status(201).json(personJson(await requireOwnedPerson(personId, user.uid)));
  });

  router.get('/:personId', async (req, res) => {
    res.json(personJson(await requireOwnedPerson(param(req, 'personId'), currentUser(res.locals).uid)));
  });

  router.put('/:personId', async (req, res) => {
    const user = currentUser(res.locals);
    const person = await requireOwnedPerson(param(req, 'personId'), user.uid);
    const body = parseOrThrow(personBody, req.body);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE persons SET name = $2, birth_date = $3, blood_type = $4, conditions = $5, allergies = $6,
                medications = $7, notes = $8, public_fields = $9, person_type = $10, disability_type = $11,
                communication = $12, care_tips = $13, updated_at = now()
         WHERE id = $1`,
        [person.id, ...personParams(body)],
      );
      await saveInsurances(client, person.id, body.insurances);
    });
    res.json(personJson(await requireOwnedPerson(person.id, user.uid)));
  });

  // 대상자를 지우면 연결된 태그는 남고 응급정보만 비게 된다(person_id = NULL)
  router.delete('/:personId', async (req, res) => {
    const person = await requireOwnedPerson(param(req, 'personId'), currentUser(res.locals).uid);
    await getPool().query('DELETE FROM persons WHERE id = $1', [person.id]);
    res.status(204).end();
  });

  return router;
}
