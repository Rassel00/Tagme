import { Icon } from '../components/Icon';
import type { Insurance, PublicTag } from '../lib/types';
import { Topbar } from './Topbar';

/**
 * 보험 정보 (11/18, 사업계획서 "119·가족·보험사 연결"). 보호자가 앱에서 보험을 등록했을 때만 메인에 버튼이 생긴다.
 * 보험은 여러 개(최대 3개)이고 공개 여부는 한 번에 정한다: 공개면 바로, 비공개면 응급정보 열람 요청이 승인되면 보인다.
 */
export function InsuranceView({
  tag,
  unlockedInsurances,
  onBack,
}: {
  tag: PublicTag;
  /** 보호자가 승인해 열린 보험 목록 */
  unlockedInsurances?: Insurance[];
  onBack: () => void;
}) {
  const insurances = tag.insurances.length > 0 ? tag.insurances : (unlockedInsurances ?? []);

  return (
    <section className="view">
      <Topbar title="보험 정보" onBack={onBack} />
      {insurances.length === 0 ? (
        <div className="access">
          <p className="access-status">
            <Icon name="lock" />
            보험 {tag.insuranceCount}개 · 비공개
          </p>
          <p>비공개 정보는 "사용자 응급정보 확인"에서 보호자에게 열람을 요청하고, 승인되면 이 화면에 보여요.</p>
        </div>
      ) : (
        insurances.map((insurance, index) => (
          <section className="card insurance-card" key={index}>
            <h2 className="card-title">
              <Icon name="shield" />
              {insurance.company}
            </h2>
            {insurance.phone && (
              <dl className="field">
                <dt>사고 접수 번호</dt>
                <dd>{insurance.phone}</dd>
              </dl>
            )}
            {insurance.note && (
              <dl className="field">
                <dt>메모</dt>
                <dd>{insurance.note}</dd>
              </dl>
            )}
            {insurance.phone && (
              <a className="btn btn-primary btn-block insurance-call" href={`tel:${insurance.phone.replace(/[^0-9]/g, '')}`}>
                <Icon name="phone" />
                사고 접수 전화
              </a>
            )}
          </section>
        ))
      )}
    </section>
  );
}
