import { PostForm } from "./_components/PostForm";

export default function NewPostPage() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-8">
      <h1 className="text-lg font-semibold text-zinc-100">Nouvelle publication</h1>
      <PostForm />
    </section>
  );
}
