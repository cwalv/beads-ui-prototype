// fo-zz4pz §1: three-destinations architecture overview stub
import { StubBanner } from '../../components/chrome/StubBanner';
import type { Destination } from '../../types';

export const handle = {
  destination: 'docs' as Destination,
  breadcrumb: ['architecture'],
};

export default function ArchitectureStub() {
  return (
    <StubBanner
      title="Architecture overview"
      description="Three-destinations model — how Author, Observe, and Capture relate to beads, molecules, and formulas."
      bead="fo-zz4pz"
      prototypeRef="prototype-v1/wf-v2.jsx:ArchOverview"
    />
  );
}
