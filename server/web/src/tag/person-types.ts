/**
 * 대상자 유형별 응급 화면 설정 (11/18, 사업계획서 19장).
 * 버튼 구성은 유형과 상관없이 같고, 제목·설명과 상단에 먼저 보여 줄 공개 항목만 다르다.
 */
import { formatBirthDate } from '../lib/format';
import type { PersonType, ProfileField, ProfileValues } from '../lib/types';

export interface PersonTypeScreen {
  title: string;
  description: string;
  /** 상단 정보 카드에 순서대로 보여 줄 항목과 표시 이름 (값이 공개된 것만 보인다) */
  topFields: [ProfileField, string][];
}

export const PERSON_TYPE_SCREENS: Record<PersonType, PersonTypeScreen> = {
  general: {
    title: '응급 지원 페이지',
    description: '이 사용자의 응급정보와\n도움이 필요한 상황을 확인할 수 있습니다.',
    topFields: [
      ['name', '이름'],
      ['birthDate', '생년월일'],
      ['bloodType', '혈액형'],
      ['conditions', '지병'],
      ['allergies', '알레르기'],
      ['medications', '복용 중인 약'],
    ],
  },
  disabled: {
    title: '이 분을 도와주세요',
    description: '말로 설명하기 어려울 수 있어요.',
    topFields: [
      ['name', '이름'],
      ['birthDate', '생년월일'],
      ['disabilityType', '장애 유형'],
      ['communication', '의사소통'],
    ],
  },
  elderly: {
    title: '어르신 응급연락',
    description: '이 분을 도와주세요. 아래를 눌러 주세요.',
    topFields: [
      ['name', '성함'],
      ['birthDate', '생년월일'],
      ['bloodType', '혈액형'],
      ['conditions', '지병'],
      ['medications', '복용약'],
    ],
  },
  child: {
    title: '어린이 응급연락',
    description: '위급 시 아래 버튼으로\n보호자 및 관련 정보를 확인하세요.',
    topFields: [
      ['name', '이름'],
      ['birthDate', '생년월일'],
      ['allergies', '알레르기'],
      ['medications', '복용약'],
      ['conditions', '지병'],
    ],
  },
};

/** 상단 정보 카드 행: 유형의 항목 중 값이 보이는 것만. 생년월일은 '2015. 03. 14. (11세)' 형식 */
export function topRows(type: PersonType, values: ProfileValues): [string, string][] {
  return PERSON_TYPE_SCREENS[type].topFields
    .map(([field, label]): [string, string | undefined] => {
      const value = values[field];
      return [label, field === 'birthDate' && value ? formatBirthDate(value) : value];
    })
    .filter((row): row is [string, string] => Boolean(row[1]));
}
