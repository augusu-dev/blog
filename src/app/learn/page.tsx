import { getAllLearnMeta } from "@/lib/markdown";
import LearnView from "@/components/LearnView";

export default function LearnPage() {
  const entries = getAllLearnMeta();
  return <LearnView entries={entries} />;
}
