import { PostForm } from "./_components/PostForm";

export default function NewPostPage() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-2">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
        Nouvelle publication
      </h1>
      <p className="text-sm text-zinc-400">
        Sélectionnez une image, ajoutez une légende, puis publiez.
      </p>
      <PostForm />
    </section>
  );
}
