type Props = {
  title: string;
};

export default function HeaderSection({ title }: Props) {
  return (
    <div>
      <div className="rounded-md bg-fuchsia-700 px-3 py-2 text-center text-white shadow-sm">
        <h3 className="text-base font-bold tracking-wide">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        DİM üslubu: maqenta başlıq və şəxsiyyət sahələri (önizləmə sxemi)
      </p>
    </div>
  );
}
