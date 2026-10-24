import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { JoinGroupForm } from "../components/JoinGroupForm";

// Landing page for shared invite links (/join/:code). The code is pre-filled; joining still takes a tap.
export default function Join() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Join a group" subtitle="You've been invited to save together." />
      <JoinGroupForm
        initialCode={code}
        onJoined={({ group, alreadyMember }) =>
          navigate("/group", { state: { notice: alreadyMember ? `You're already in ${group.name}.` : `You joined ${group.name}!` } })
        }
      />
    </div>
  );
}
