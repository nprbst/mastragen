{{/*
Expand the name of the chart.
*/}}
{{- define "mastragen.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "mastragen.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "mastragen.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "mastragen.labels" -}}
helm.sh/chart: {{ include "mastragen.chart" . }}
{{ include "mastragen.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "mastragen.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mastragen.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Orchestrator labels
*/}}
{{- define "mastragen.orchestrator.labels" -}}
{{ include "mastragen.labels" . }}
app.kubernetes.io/component: orchestrator
{{- end }}

{{/*
Orchestrator selector labels
*/}}
{{- define "mastragen.orchestrator.selectorLabels" -}}
{{ include "mastragen.selectorLabels" . }}
app.kubernetes.io/component: orchestrator
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "mastragen.serviceAccountName" -}}
{{- if .Values.orchestrator.serviceAccount.create }}
{{- default (include "mastragen.fullname" .) .Values.orchestrator.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.orchestrator.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Orchestrator image
*/}}
{{- define "mastragen.orchestrator.image" -}}
{{- printf "%s:%s" .Values.orchestrator.image.repository (.Values.orchestrator.image.tag | default .Chart.AppVersion) }}
{{- end }}

{{/*
Tailscale image
*/}}
{{- define "mastragen.tailscale.image" -}}
{{- printf "%s:%s" .Values.tailscale.image.repository .Values.tailscale.image.tag }}
{{- end }}

{{/*
Caddy image (T095c)
*/}}
{{- define "mastragen.caddy.image" -}}
{{- printf "%s:%s" .Values.caddy.image.repository .Values.caddy.image.tag }}
{{- end }}
