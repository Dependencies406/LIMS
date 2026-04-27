#!/bin/bash
# Script to grant Storage Admin role to all service accounts in a Google Cloud project

PROJECT_ID="scs-lims"
ROLE="roles/storage.admin"

echo "Granting Storage Admin role to all service accounts in project: $PROJECT_ID"
echo ""

# List all service accounts
SERVICE_ACCOUNTS=$(gcloud iam service-accounts list --project=$PROJECT_ID --format="value(email)")

if [ -z "$SERVICE_ACCOUNTS" ]; then
    echo "No service accounts found in project $PROJECT_ID"
    exit 1
fi

echo "Found service accounts:"
echo "$SERVICE_ACCOUNTS"
echo ""

# Grant Storage Admin role to each service account
for SA_EMAIL in $SERVICE_ACCOUNTS; do
    echo "Granting Storage Admin role to: $SA_EMAIL"
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$ROLE" \
        --condition=None
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully granted Storage Admin to $SA_EMAIL"
    else
        echo "❌ Failed to grant Storage Admin to $SA_EMAIL"
    fi
    echo ""
done

echo "Done! All service accounts have been granted Storage Admin role."
echo "Wait 2-3 minutes for permissions to propagate, then test your upload."
