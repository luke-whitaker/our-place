-- Seeds stack in one slot. Every existing row is a single item.
ALTER TABLE "items" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- A stack is never empty (an emptied stack's row is deleted) and never past
-- MAX_STACK (99) in src/lib/items.ts.
ALTER TABLE "items" ADD CONSTRAINT "items_quantity_range" CHECK ("quantity" BETWEEN 1 AND 99);
