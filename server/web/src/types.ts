/** 공개 API 응답 타입 (개발 문서 6.2·6.5). 서버 응답 형식이 바뀌면 같이 고친다. */

export type ProfileField =
  | 'name'
  | 'birthDate'
  | 'bloodType'
  | 'conditions'
  | 'allergies'
  | 'medications'
  | 'notes';

export type ProfileValues = Partial<Record<ProfileField, string>>;

export interface PublicTag {
  publicInfo: ProfileValues;
  lockedFields: ProfileField[];
  contactCount: number;
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
  createAlert(action: AlertAction, position: LatLng | null): Promise<CreateAlertResult>;
  getAlert(alertId: string): Promise<AlertStatus>;
  getAeds(position: LatLng, limit: number): Promise<Aed[]>;
}
