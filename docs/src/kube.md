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
        command: ["-c=postgres", "/seeds"]

        env:
          - name: GERMINATOR_HOST
            value: db-host
          - name: GERMINATOR_PORT
            value: '5432'
          - name: GERMINATOR_PASSWORD
            valueFrom:
              secretKeyRef:
                name: secrets
                key: dbPassword

        # mount a folder of YAML files into /seeds
        volumeMounts:
          - name: seeds
            readOnly: true
            mountPath: "/seeds"
  ```

How you set up credentials to the database is entirely up to your setup.
