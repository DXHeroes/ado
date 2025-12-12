# Sandboxing Strategy

## Přehled

Design bezpečné izolace pro provádění AI-generovaného kódu s minimální latencí a maximální bezpečností.

## Proč je sandboxing kritický

AI-generovaný kód je **inherentně nedůvěryhodný**:
- Může obsahovat neúmyslné bezpečnostní chyby
- LLM může být manipulován k generování škodlivého kódu
- Nutnost testování v bezpečném prostředí před mergeM
- Ochrana host systému před resource exhaustion

## Porovnání izolačních strategií

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Sandbox Isolation Comparison                              │
└─────────────────────────────────────────────────────────────────────────────┘

                Docker          Firecracker         E2B
                Containers      MicroVMs            Cloud Sandboxes
                ──────────      ───────────         ───────────────

Isolation       Namespace       Full VM kernel      Full VM kernel
Level           isolation       isolation           isolation

Startup         1-3s            125ms               200-500ms
Time

Memory          ~100MB          ~5MB                ~50MB
Overhead

Security        Good            Excellent           Excellent
                (shared kernel) (isolated kernel)   (isolated kernel)

Network         Bridge/NAT      TAP/macvtap         Configurable
                Easy setup      More complex        Managed

Best For        - Development   - Production        - Production
                - CI/CD         - Multi-tenant      - Quick start
                - Simple cases  - High security     - Managed service
```

## Doporučená strategie: Firecracker MicroVMs

**Firecracker poskytuje optimální balance**:
- **Security**: Full kernel isolation (každý agent má vlastní kernel)
- **Performance**: ~125ms startup, ~5MB memory overhead
- **Proven**: AWS Lambda, Fly.io production workloads
- **Open Source**: Apache 2.0 license

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Firecracker Sandbox Architecture                         │
└─────────────────────────────────────────────────────────────────────────────┘

Host System
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      ADO Orchestrator                                  │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │  │
│  │  │   Task 1     │  │   Task 2     │  │   Task N     │                │  │
│  │  │   Queue      │  │   Queue      │  │   Queue      │                │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                │  │
│  │         │                 │                 │                         │  │
│  └─────────┼─────────────────┼─────────────────┼─────────────────────────┘  │
│            │                 │                 │                            │
│            ▼                 ▼                 ▼                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│  │  Firecracker    │ │  Firecracker    │ │  Firecracker    │              │
│  │  MicroVM 1      │ │  MicroVM 2      │ │  MicroVM N      │              │
│  │                 │ │                 │ │                 │              │
│  │  ┌───────────┐  │ │  ┌───────────┐  │ │  ┌───────────┐  │              │
│  │  │ Guest OS  │  │ │  │ Guest OS  │  │ │  │ Guest OS  │  │              │
│  │  │ (Alpine)  │  │ │  │ (Alpine)  │  │ │  │ (Alpine)  │  │              │
│  │  │           │  │ │  │           │  │ │  │           │  │              │
│  │  │ Agent     │  │ │  │ Agent     │  │ │  │ Agent     │  │              │
│  │  │ Runtime   │  │ │  │ Runtime   │  │ │  │ Runtime   │  │              │
│  │  └───────────┘  │ │  └───────────┘  │ │  └───────────┘  │              │
│  │                 │ │                 │ │                 │              │
│  │  Resources:     │ │  Resources:     │ │  Resources:     │              │
│  │  - 2 vCPU       │ │  - 2 vCPU       │ │  - 2 vCPU       │              │
│  │  - 4GB RAM      │ │  - 4GB RAM      │ │  - 4GB RAM      │              │
│  │  - 10GB disk    │ │  - 10GB disk    │ │  - 10GB disk    │              │
│  │  - No network*  │ │  - No network*  │ │  - No network*  │              │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘              │
│                                                                             │
│  * Network only via host proxy for package installs                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation

### Firecracker VM Configuration

```typescript
// packages/core/src/sandbox/firecracker-manager.ts
export class FirecrackerManager {
  async createMicroVM(taskId: string, config: VMConfig): Promise<MicroVM> {
    const vmConfig = {
      'boot-source': {
        kernel_image_path: '/var/lib/firecracker/vmlinux',
        boot_args: 'console=ttyS0 reboot=k panic=1 pci=off',
      },
      drives: [
        {
          drive_id: 'rootfs',
          path_on_host: `/var/lib/ado/rootfs/${taskId}.ext4`,
          is_root_device: true,
          is_read_only: false,
        },
      ],
      'machine-config': {
        vcpu_count: config.vcpus || 2,
        mem_size_mib: config.memory || 4096,
        ht_enabled: false,
      },
      'network-interfaces': config.networkEnabled
        ? [
            {
              iface_id: 'eth0',
              guest_mac: this.generateMac(),
              host_dev_name: `tap-${taskId}`,
            },
          ]
        : [],
      // Security: Disable MMDS and vsock by default
      mmds: { version: 'V2', ipv4_address: '' },
      vsock: null,
    };

    // Create VM via Firecracker API
    const vm = await this.firecracker.createVM(vmConfig);

    // Configure resource limits
    await this.configureResourceLimits(vm, {
      maxCpu: config.cpuLimit || 200, // 200% (2 vCPU max)
      maxMemory: config.memory || 4096,
      maxDisk: config.diskLimit || 10 * 1024, // 10GB
      timeout: config.timeout || 3600, // 1 hour
    });

    return vm;
  }

  private async configureResourceLimits(
    vm: MicroVM,
    limits: ResourceLimits
  ): Promise<void> {
    // CPU quota via cgroups
    await vm.setCgroupLimit('cpu.cfs_quota_us', limits.maxCpu * 1000);
    await vm.setCgroupLimit('cpu.cfs_period_us', 100000);

    // Memory limit
    await vm.setCgroupLimit('memory.limit_in_bytes', limits.maxMemory * 1024 * 1024);

    // Disk I/O limit
    await vm.setCgroupLimit('blkio.throttle.write_bps_device', '10485760'); // 10MB/s

    // Kill VM after timeout
    setTimeout(() => {
      if (vm.status === 'running') {
        vm.terminate('timeout');
      }
    }, limits.timeout * 1000);
  }
}
```

### Network Isolation

```typescript
// packages/core/src/sandbox/network-policy.ts
export class NetworkPolicy {
  // Default: No network access
  private readonly DEFAULT_POLICY = 'DENY_ALL';

  async configureNetwork(vm: MicroVM, policy: NetworkPolicyConfig): Promise<void> {
    switch (policy.mode) {
      case 'none':
        // No network interface - maximum security
        return;

      case 'proxy':
        // HTTP/HTTPS proxy for package installs only
        await this.setupProxy(vm, {
          allowedDomains: [
            'registry.npmjs.org',
            'pypi.org',
            'crates.io',
            'proxy.golang.org',
          ],
          blockPrivateIPs: true,
        });
        break;

      case 'restricted':
        // Allow specific outbound only
        await this.setupFirewall(vm, {
          outbound: policy.allowedDestinations || [],
          inbound: [], // Never allow inbound
        });
        break;

      case 'full':
        // Full network (use with caution)
        console.warn('VM has full network access - use only for trusted code');
        break;
    }
  }

  private async setupProxy(vm: MicroVM, config: ProxyConfig): Promise<void> {
    // Configure transparent HTTP/HTTPS proxy
    await vm.exec(`
      export http_proxy=http://host.ado.internal:3128
      export https_proxy=http://host.ado.internal:3128
      export no_proxy=localhost,127.0.0.1
    `);

    // Proxy filters requests by domain whitelist
    this.proxyServer.setWhitelist(config.allowedDomains);
    this.proxyServer.blockPrivateIPs = config.blockPrivateIPs;
  }
}
```

### Code Execution Flow

```typescript
// packages/core/src/sandbox/executor.ts
export class SandboxExecutor {
  async executeCode(
    code: string,
    language: Language,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    // 1. Create isolated MicroVM
    const vm = await this.firecracker.createMicroVM(context.taskId, {
      vcpus: 2,
      memory: 4096,
      networkEnabled: context.requiresNetwork,
      timeout: context.timeout || 600, // 10 min default
    });

    try {
      // 2. Copy code to VM
      await vm.writeFile('/workspace/code', code);

      // 3. Install dependencies (if needed)
      if (context.dependencies) {
        await this.installDependencies(vm, language, context.dependencies);
      }

      // 4. Execute code
      const result = await vm.exec(this.getExecutionCommand(language), {
        cwd: '/workspace',
        timeout: context.timeout,
        captureOutput: true,
      });

      // 5. Collect results
      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration,
        resourceUsage: await vm.getResourceUsage(),
      };
    } finally {
      // 6. Always cleanup VM
      await vm.terminate();
      await this.cleanupResources(vm.id);
    }
  }

  private getExecutionCommand(language: Language): string {
    const commands: Record<Language, string> = {
      typescript: 'npx tsx code',
      javascript: 'node code',
      python: 'python3 code',
      go: 'go run code',
      rust: 'rustc code && ./code',
      java: 'javac code && java code',
    };
    return commands[language] || 'sh code';
  }
}
```

## E2B Alternative (Managed Service)

Pro rychlý start nebo managed deployment lze použít **E2B Cloud Sandboxes**:

```typescript
// packages/core/src/sandbox/e2b-adapter.ts
import { Sandbox } from '@e2b/code-interpreter';

export class E2BSandboxAdapter {
  async executeCode(
    code: string,
    language: Language
  ): Promise<ExecutionResult> {
    const sandbox = await Sandbox.create({
      template: language,
      timeout: 600,
    });

    try {
      const execution = await sandbox.runCode(code);

      return {
        success: !execution.error,
        stdout: execution.logs.stdout.join('\n'),
        stderr: execution.logs.stderr.join('\n'),
        exitCode: execution.error ? 1 : 0,
        duration: execution.duration,
      };
    } finally {
      await sandbox.close();
    }
  }
}
```

**E2B výhody**:
- Managed service (zero infrastructure)
- 200-500ms startup
- Built-in language templates
- Automatic cleanup
- Pay-per-use pricing

**E2B nevýhody**:
- Vendor lock-in
- Network latency (cloud roundtrip)
- Limited customization
- Monthly costs scale with usage

## Docker Fallback (Development)

Pro lokální development lze použít Docker:

```typescript
// packages/core/src/sandbox/docker-adapter.ts
export class DockerSandboxAdapter {
  async executeCode(
    code: string,
    language: Language
  ): Promise<ExecutionResult> {
    const container = await this.docker.createContainer({
      Image: `ado-sandbox-${language}:latest`,
      Cmd: [this.getExecutionCommand(language)],
      HostConfig: {
        Memory: 4 * 1024 * 1024 * 1024, // 4GB
        NanoCpus: 2 * 1e9, // 2 CPUs
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        SecurityOpt: ['no-new-privileges'],
      },
      WorkingDir: '/workspace',
    });

    await container.start();

    // Stream output
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    // Wait for completion or timeout
    const result = await container.wait({ condition: 'not-running' });

    await container.remove({ force: true });

    return result;
  }
}
```

## Security Hardening

### Rootless Execution

```bash
# Run Firecracker as non-root user
sudo setcap cap_net_admin+ep /usr/bin/firecracker

# Create unprivileged user
useradd -r -s /bin/false firecracker

# Run VMs as firecracker user
su -s /bin/bash firecracker -c "firecracker --api-sock /tmp/fc.sock"
```

### Seccomp Filtering

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": ["read", "write", "open", "close", "stat", "fstat", "lseek", "mmap", "mprotect", "munmap", "brk", "rt_sigaction", "rt_sigprocmask", "ioctl", "access", "pipe", "select", "sched_yield", "mremap", "msync", "dup", "dup2", "getpid", "socket", "connect", "accept", "sendto", "recvfrom", "shutdown", "bind", "listen", "getsockname", "getpeername", "socketpair", "setsockopt", "getsockopt", "clone", "fork", "vfork", "execve", "exit", "wait4", "kill", "uname", "fcntl", "flock", "fsync", "fdatasync", "truncate", "ftruncate", "getdents", "getcwd", "chdir", "fchdir", "readlink", "chmod", "fchmod", "chown", "fchown", "lchown", "umask", "gettimeofday", "getrlimit", "getrusage", "sysinfo", "times", "getuid", "getgid", "setuid", "setgid", "geteuid", "getegid", "setpgid", "getppid", "getpgrp", "setsid", "setreuid", "setregid", "getgroups", "setgroups", "setresuid", "getresuid", "setresgid", "getresgid"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

## Resource Monitoring

```typescript
// packages/core/src/sandbox/resource-monitor.ts
export class ResourceMonitor {
  async monitorVM(vm: MicroVM): Promise<void> {
    const interval = setInterval(async () => {
      const usage = await vm.getResourceUsage();

      // Alert on high usage
      if (usage.cpu > 90) {
        this.alerts.emit('high-cpu', { vmId: vm.id, usage: usage.cpu });
      }

      if (usage.memory > 0.9 * vm.config.memory) {
        this.alerts.emit('high-memory', { vmId: vm.id, usage: usage.memory });
      }

      // Kill runaway processes
      if (usage.cpu === 100 && usage.duration > 60000) {
        await vm.terminate('runaway-process');
      }

      // Metrics
      this.metrics.recordVMUsage(vm.id, usage);
    }, 5000); // Check every 5s

    vm.on('terminated', () => clearInterval(interval));
  }
}
```

## Configuration

```yaml
# ado.config.yaml
sandbox:
  # Strategy: firecracker | e2b | docker
  strategy: firecracker

  # Firecracker settings
  firecracker:
    kernelPath: /var/lib/firecracker/vmlinux
    rootfsPath: /var/lib/ado/rootfs
    socketPath: /tmp/firecracker

  # Default resource limits
  resources:
    vcpus: 2
    memory: 4096  # MB
    disk: 10240   # MB
    timeout: 3600 # seconds

  # Network policy
  network:
    mode: proxy  # none | proxy | restricted | full
    allowedDomains:
      - registry.npmjs.org
      - pypi.org
      - crates.io

  # E2B (if using)
  e2b:
    apiKey: ${E2B_API_KEY}
    templates:
      typescript: node20
      python: python311

  # Cleanup
  cleanup:
    onSuccess: immediate
    onFailure: delayed  # Keep for debugging
    maxAge: 86400  # 24 hours
```

---

## Souvislosti

- [Threat Model](./threat-model.md)
- [Secrets Management](./secrets-management.md)
- [NFR-004: Security](../../02-requirements/02-non-functional/NFR-004-security.md)
- [Test & Build Validation](../02-autonomous-workflow/test-build-validation.md)
