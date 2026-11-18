/** 공개 API 응답 타입 (개발 문서 6.2·6.5). 서버 응답 형식이 바뀌면 같이 고친다. */

export type ProfileField =
  | 'name'
  | 'birthDate'
  | 'bloodType'
  | 'conditions'
  | 'allergies'
  | 'medications'
  | 'notes'
  | 'disabilityType'
  | 'communication'
  | 'careTips';

/** 잠긴 항목: 응급정보 항목 + 보험 목록 전체('insurances') */
export type LockedField = ProfileField | 'insurances';

export interface Insurance {
  /** 보험사·상품 이름 (예: OO손해보험) */
  company: string;
  phone: string;
  note: string;
}

/** 대상자 유형 (11/18). 응급 화면의 제목과 상단에 먼저 보여 줄 항목이 달라진다 */
export type PersonType = 'general' | 'disabled' | 'elderly' | 'child';

export type ProfileValues = Partial<Record<ProfileField, string>>;

export interface PublicTag {
  personType: PersonType;
  publicInfo: ProfileValues;
  lockedFields: LockedField[];
  /** 공개된 보험 목록 (비공개면 빈 배열이고 lockedFields 에 'insurances') */
  insurances: Insurance[];
  /** 등록된 보험 수 (공개 여부와 무관). 0 이 아니면 "보험 정보" 버튼 */
  insuranceCount: number;
  contactCount: number;
  /** 수락한 보호자 수. 열람 요청은 보호자에게만 가므로 0 이면 열람 요청을 막는다 */
  guardianCount: number;
}

export type AlertAction = 'contact' | 'requestAccess';

export interface CreateAlertResult {
  alertId: string;
  code: string;
  /** 이번 요청으로 문자를 보낸 보호자 수 (병합되어 발송하지 않았으면 0) */
  notifiedCount: number;
  isMerged: boolean;
}

export type AccessStatus = 'none' | 'requested' | 'approved' | 'denied' | 'expired';

export interface AlertStatus {
  accessStatus: AccessStatus;
  approvedUntil?: string;
  emergencyInfo?: ProfileValues;
  /** 승인되면 비공개였던 보험 목록 */
  insurances?: Insurance[];
  /** 보호자가 [제가 대응할게요]를 누른 시각 (누구인지는 신고자에게 보이지 않는다) */
  guardianRespondingAt?: string | null;
}

export interface Aed {
  name: string;
  place: string;
  address: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** 404 = 없는 태그, 410 = 비활성 태그 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface PublicApi {
  getTag(): Promise<PublicTag>;
  /** memo: 비상연락망 연락 확인 팝업의 신고자 메모 (보호자 문자·승인 페이지에 표시) */
  createAlert(action: AlertAction, position: LatLng | null, memo?: string): Promise<CreateAlertResult>;
  getAlert(alertId: string): Promise<AlertStatus>;
  getAeds(position: LatLng, limit: number): Promise<Aed[]>;
}
