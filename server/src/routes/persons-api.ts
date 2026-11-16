/** 보호 대상자 (응급정보의 주인) CRUD. 태그는 대상자에 연결된다. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { PROFILE_FIELDS } from '../domain/constants.js';
import { currentUser } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { param } from '../lib/http.js';
import { parseOrThrow } from '../lib/validate.js';
import { findOwnedPerson, PERSON_COLUMNS, personJson, toPerson } from '../repos/persons.js';

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
  publicFields: z
    .array(z.enum(PROFILE_FIELDS))
    .max(PROFILE_FIELDS.length)
    .default([])
    .transform((fields) => [...new Set(fields)]),
});

export function personParams(p: z.infer<typeof personBody>) {
  return [p.name, p.birthDate || null, p.bloodType, p.conditions, p.allergies, p.medications, p.notes, p.publicFields];
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
    res.json(rows.map((row) => ({ ...personJson(toPerson(row)), tagCount: row.tag_count as number })));
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
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO persons (user_id, name, birth_date, blood_type, conditions, allergies, medications, notes, public_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [user.uid, ...personParams(body)],
    );
    res.status(201).json(personJson(await requireOwnedPerson(rows[0]!.id, user.uid)));
  });

  router.get('/:personId', async (req, res) => {
    res.json(personJson(await requireOwnedPerson(param(req, 'personId'), currentUser(res.locals).uid)));
  });

  router.put('/:personId', async (req, res) => {
    const user = currentUser(res.locals);
    const person = await requireOwnedPerson(param(req, 'personId'), user.uid);
    const body = parseOrThrow(personBody, req.body);
    await getPool().query(
      `UPDATE persons SET name = $2, birth_date = $3, blood_type = $4, conditions = $5, allergies = $6,
              medications = $7, notes = $8, public_fields = $9, updated_at = now()
       WHERE id = $1`,
      [person.id, ...personParams(body)],
    );
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
