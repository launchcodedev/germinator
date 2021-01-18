# Using in Kubernetes

Germinator would usually be run as a `Job` Kubernetes resource.

```yaml
apiVersion: batch/v1
kind: Job

metadata:
  name: seeds

spec:
  template:
    spec:
      containers:
      - name: seeds
        image: joelgallant/germinator
        command: ["-c=postgres", "-h=db-host", "-p=5432", "--pass=secured"]

      restartPolicy: Never
```

How you set up credentials to the database is entirely up to your setup.
