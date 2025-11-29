import Link from "next/link";

export default function BMarksPage() {
  return (
    <div>
      <h1>This page is no longer in use.</h1>
      <p>Please use the <Link href="/admin/results" className="text-blue-500 underline">Results</Link> page.</p>
    </div>
  );
}
