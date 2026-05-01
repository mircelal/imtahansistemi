import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { IdentityBlockId } from "./identityFieldModel";
import { blockTitle } from "./identityFieldModel";

function SortableRow({ id }: { id: IdentityBlockId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border border-fuchsia-200 bg-fuchsia-50/80 px-3 py-2 text-sm ${
        isDragging ? "opacity-70 shadow-md" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-fuchsia-800 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Sürüklə"
      >
        ⋮⋮
      </button>
      <span className="text-slate-800">{blockTitle(id)}</span>
    </div>
  );
}

type Props = {
  order: IdentityBlockId[];
  onReorder: (next: IdentityBlockId[]) => void;
};

export default function IdentityBlocksSortable({ order, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as IdentityBlockId);
    const newIndex = order.indexOf(over.id as IdentityBlockId);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(order, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {order.map((id) => (
            <SortableRow key={id} id={id} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
