import os
import sys

from pymongo import MongoClient
from mongo_seeder import (
    MONGO_URI,
    MONGO_DB,
    NUM_SEARCH_SESSIONS,
    BATCH_SIZE,
    fetch_reference_ids,
    generate_search_sessions,
)
from datetime import datetime, timezone

def main():
    guests, properties = fetch_reference_ids()
    client = MongoClient(MONGO_URI)

    try:
        db = client[MONGO_DB]
        sessions = db["SearchSessions"]

        existing = sessions.count_documents({})
        remaining = max(0, NUM_SEARCH_SESSIONS - existing)

        print(f"Existing SearchSessions: {existing:,}")
        print(f"Sessions to add: {remaining:,}")

        if remaining == 0:
            print("Target count already reached; nothing to do.")
            return

        generator = generate_search_sessions(
            guests, properties, datetime.now(timezone.utc)
        )

        # Preserve existing records; insert only the number still needed.
        batch = []
        inserted = 0
        for document in generator:
            batch.append(document)
            if len(batch) >= min(BATCH_SIZE, remaining - inserted):
                sessions.insert_many(batch, ordered=False)
                inserted += len(batch)
                batch = []
                print(f"Inserted {inserted:,} / {remaining:,}", flush=True)
                if inserted >= remaining:
                    break

        if batch and inserted < remaining:
            sessions.insert_many(batch, ordered=False)
            inserted += len(batch)

        print(f"Done. SearchSessions count: {sessions.count_documents({}):,}")
    finally:
        client.close()

if __name__ == "__main__":
    main()
