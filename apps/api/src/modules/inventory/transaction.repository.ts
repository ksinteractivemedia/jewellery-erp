import type { ClientSession } from "mongoose";
import type { Transaction } from "@jewellery/types";
import { createTransactionSchema, type CreateTransactionInput } from "@jewellery/validation";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { TransactionModel } from "./transaction.model";

export async function createTransaction(input: CreateTransactionInput, session?: ClientSession): Promise<Transaction> {
  const parsed = createTransactionSchema.parse(input);
  const [doc] = await TransactionModel.create([parsed], { session });
  return toDTO<Transaction>(doc)!;
}

export async function findTransactionById(id: string): Promise<Transaction | null> {
  return toDTO<Transaction>(await TransactionModel.findById(id));
}

export async function listTransactionsByReference(referenceType: string, referenceId: string): Promise<Transaction[]> {
  return toDTOList<Transaction>(await TransactionModel.find({ referenceType, referenceId }).sort({ createdAt: -1 }));
}
