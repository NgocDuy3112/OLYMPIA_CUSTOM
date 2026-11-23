import { useState, type SubmitEvent, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { cn } from "cn"

import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@shared/ui/input-otp"
import { QRCode } from "@shared/ui/qr-code"

import {
  classifyMfaFailure,
  loginErrorMessage,
  useLogin,
  useVerifyMfa,
} from "@/lib/auth"

const CODE_LENGTH = 6

type Step =
  | { kind: "credentials"; notice?: string }
  | { kind: "code"; pendingToken: string; otpauthUri?: string; notice?: string }

function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? ""
  } catch {
    return ""
  }
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [step, setStep] = useState<Step>({ kind: "credentials" })
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")

  const login = useLogin()
  const verify = useVerifyMfa()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: string } | null)?.from ?? "/"

  const submitCredentials = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    login.mutate(
      { username, password },
      {
        onSuccess: (result) => {
          setPassword("")
          setCode("")
          const codeStep: Step = {
            kind: "code",
            pendingToken: result.pendingToken,
          }
          if (result.otpauthUri) codeStep.otpauthUri = result.otpauthUri
          setStep(codeStep)
        },
      }
    )
  }

  const submitCode = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step.kind !== "code") return

    verify.mutate(
      { pendingToken: step.pendingToken, code },
      {
        onSuccess: () => navigate(from, { replace: true }),

        onError: (error) => {
          const failure = classifyMfaFailure(error)
          setCode("")

          if (failure === "expired") {
            setStep({
              kind: "credentials",
              notice: "That took too long. Please sign in again.",
            })
            return
          }

          let notice = "That code didn't work. Check the app and try again."
          if (failure === "rate-limited") notice = "Too many attempts. Try again in a minute."
          if (failure === "reused") notice = "That code was already used. Wait for the next one."
          setStep({
            ...step,
            notice,
          })
        },
      }
    )
  }

  let loginLabel = "Continue"
  if (login.isPending) loginLabel = "Signing in…"

  let stepSlot: ReactNode = (
            <form className="p-6 md:p-8" onSubmit={submitCredentials}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Sign in</h1>
                  <p className="text-balance text-muted-foreground">
                    Operator access to AOC
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input
                    id="username"
                    autoComplete="username"
                    placeholder="ADMIN"
                    autoFocus
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                {login.isError && (
                  <FieldError>{loginErrorMessage(login.error)}</FieldError>
                )}
                {step.notice && <FieldError>{step.notice}</FieldError>}
                <Field>
                  <Button type="submit" disabled={login.isPending}>
                    {loginLabel}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
  )
  if (step.kind !== "credentials") {
    let titleText = "Two-factor code"
    if (step.otpauthUri) titleText = "Set up your authenticator"
    let hintText = "Enter the 6-digit code from your authenticator app."
    if (step.otpauthUri) hintText = "Scan this with your authenticator app, then enter the 6-digit code it shows."
    let verifyLabel = "Confirm"
    if (verify.isPending) verifyLabel = "Verifying…"
    stepSlot = (
            <form className="p-6 md:p-8" onSubmit={submitCode}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">
                    {titleText}
                  </h1>
                  <p className="text-balance text-muted-foreground">
                    {hintText}
                  </p>
                </div>

                {step.otpauthUri && (
                  <div className="flex flex-col items-center gap-3">
                    <QRCode
                      value={step.otpauthUri}
                      title="Authenticator setup QR code"
                    />
                    {secretFromUri(step.otpauthUri) && (
                      <FieldDescription className="text-center">
                        Can&apos;t scan it? Enter this key manually:
                        <code className="mt-1 block font-mono text-xs break-all">
                          {secretFromUri(step.otpauthUri)}
                        </code>
                      </FieldDescription>
                    )}
                  </div>
                )}

                <Field>
                  <InputOTP
                    id="code"
                    maxLength={CODE_LENGTH}
                    value={code}
                    onChange={setCode}
                    autoFocus
                    containerClassName="justify-center"
                  >
                    <InputOTPGroup>
                      {Array.from({ length: CODE_LENGTH }, (_, index) => (
                        <InputOTPSlot 
                          key={index} 
                          index={index}
                          className="size-12 text-lg sm:size-12 sm:text-xl [&>div>div]:h-6"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </Field>

                {step.notice && <FieldError>{step.notice}</FieldError>}

                <Field className="gap-4">
                  <Button
                    type="submit"
                    disabled={code.length !== CODE_LENGTH || verify.isPending}
                  >
                    {verifyLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep({ kind: "credentials" })}
                  >
                    Start over
                  </Button>
                </Field>
              </FieldGroup>
            </form>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="p-0">{stepSlot}</CardContent>
      </Card>
    </div>
  )
}
